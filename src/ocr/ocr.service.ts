import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { 
  TextractClient, 
  DetectDocumentTextCommand,
  StartDocumentTextDetectionCommand,
  GetDocumentTextDetectionCommand,
} from '@aws-sdk/client-textract';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { S3Service } from '../s3/s3.service';
import { OcrRequestDto, OcrLanguage } from './dto/ocr-request.dto';

export interface OcrResult {
  text: string;
  confidence: number;
  language: string;
  processingTime: number;
  pageCount: number;
  summary?: string;
}

export interface DocumentAnalysisResult {
  documentId: string;
  extractedText: string;
  summary: string;
  confidence: number;
  pageCount: number;
  processingTime: number;
}

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);
  private textractClient: TextractClient;
  private bedrockClient: BedrockRuntimeClient;

  constructor(
    private readonly configService: ConfigService,
    private readonly s3Service: S3Service,
  ) {
    const region = this.configService.get<string>('AWS_REGION') || 'ap-southeast-2';
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');

    if (!accessKeyId || !secretAccessKey) {
      throw new Error('AWS credentials not configured');
    }
    
    // Textract: use configured region (ap-southeast-2)
    this.textractClient = new TextractClient({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    // Bedrock: MUST use us-east-1 for Claude 3.5 Sonnet support
    this.bedrockClient = new BedrockRuntimeClient({
      region: 'us-east-1',
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
    
    this.logger.log(`Textract configured for region: ${region}`);
    this.logger.log('Bedrock configured for region: us-east-1');
  }

  /**
   * Extract text from document using AWS Textract
   * Handles both single-page (synchronous) and multi-page PDFs (asynchronous)
   */
  async extractTextFromDocument(s3Key: string): Promise<{ text: string; confidence: number; pageCount: number }> {
    const startTime = Date.now();
    this.logger.log(`Starting Textract extraction for: ${s3Key}`);

    try {
      const bucket = this.configService.get<string>('AWS_S3_BUCKET_NAME');
      
      if (!bucket) {
        throw new BadRequestException('S3 bucket not configured');
      }
      
      // Validate file format from S3 key
      const fileExtension = s3Key.split('.').pop()?.toLowerCase();
      const supportedFormats = ['pdf', 'png', 'jpg', 'jpeg', 'tiff', 'tif'];
      
      if (!fileExtension || !supportedFormats.includes(fileExtension)) {
        throw new BadRequestException(
          `Unsupported file format: ${fileExtension}. Textract supports: ${supportedFormats.join(', ')}`
        );
      }

      this.logger.log(`Textract request - Bucket: ${bucket}, Key: ${s3Key}`);
      
      // For PDFs, use asynchronous API (supports multi-page)
      if (fileExtension === 'pdf') {
        return await this.extractTextFromPdfAsync(bucket, s3Key);
      }
      
      // For images, use synchronous API
      const command = new DetectDocumentTextCommand({
        Document: {
          S3Object: {
            Bucket: bucket,
            Name: s3Key,
          },
        },
      });

      const response = await this.textractClient.send(command);
      
      // Extract text and calculate average confidence
      let extractedText = '';
      let totalConfidence = 0;
      let confidenceCount = 0;

      if (response.Blocks) {
        for (const block of response.Blocks) {
          if (block.BlockType === 'LINE' && block.Text) {
            extractedText += block.Text + '\n';
            if (block.Confidence) {
              totalConfidence += block.Confidence;
              confidenceCount++;
            }
          }
        }
      }

      const avgConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0;
      const processingTime = Date.now() - startTime;

      this.logger.log(`Textract extraction completed in ${processingTime}ms. Confidence: ${avgConfidence.toFixed(2)}%`);

      return {
        text: extractedText.trim(),
        confidence: avgConfidence,
        pageCount: 1,
      };
    } catch (error) {
      this.logger.error(`Textract extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // Provide more specific error messages
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMessage.includes('unsupported document format')) {
        throw new BadRequestException(
          'Document format not supported by Textract. Please ensure the file is PDF, PNG, JPG, or TIFF.'
        );
      }
      
      if (errorMessage.includes('Access Denied') || errorMessage.includes('NoSuchKey')) {
        throw new BadRequestException(
          `Cannot access file in S3: ${s3Key}. The file may not exist or bucket permissions may be incorrect.`
        );
      }
      
      throw new BadRequestException(`Failed to extract text from document: ${errorMessage}`);
    }
  }

  /**
   * Extract text from multi-page PDF using asynchronous Textract API
   */
  private async extractTextFromPdfAsync(bucket: string, s3Key: string): Promise<{ text: string; confidence: number; pageCount: number }> {
    this.logger.log(`Using asynchronous Textract API for PDF: ${s3Key}`);
    
    try {
      // Start the asynchronous job
      const startCommand = new StartDocumentTextDetectionCommand({
        DocumentLocation: {
          S3Object: {
            Bucket: bucket,
            Name: s3Key,
          },
        },
      });

      const startResponse = await this.textractClient.send(startCommand);
      const jobId = startResponse.JobId;

      if (!jobId) {
        throw new BadRequestException('Failed to start Textract job');
      }

      this.logger.log(`Textract job started with ID: ${jobId}`);

      // Poll for completion (max 2 minutes)
      let attempts = 0;
      const maxAttempts = 40; // 40 * 3 seconds = 2 minutes
      let jobStatus = 'IN_PROGRESS';

      while (jobStatus === 'IN_PROGRESS' && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
        
        const getCommand = new GetDocumentTextDetectionCommand({ JobId: jobId });
        const getResponse = await this.textractClient.send(getCommand);
        
        jobStatus = getResponse.JobStatus || 'FAILED';
        this.logger.log(`Textract job status (attempt ${attempts + 1}/${maxAttempts}): ${jobStatus}`);

        if (jobStatus === 'SUCCEEDED') {
          // Extract text from results
          let extractedText = '';
          let totalConfidence = 0;
          let confidenceCount = 0;
          const pages = new Set<number>();

          if (getResponse.Blocks) {
            for (const block of getResponse.Blocks) {
              if (block.BlockType === 'LINE' && block.Text) {
                extractedText += block.Text + '\n';
                if (block.Confidence) {
                  totalConfidence += block.Confidence;
                  confidenceCount++;
                }
              }
              if (block.Page) {
                pages.add(block.Page);
              }
            }
          }

          // Handle pagination - get all pages if there are more
          let nextToken = getResponse.NextToken;
          while (nextToken) {
            const nextCommand = new GetDocumentTextDetectionCommand({ 
              JobId: jobId,
              NextToken: nextToken,
            });
            const nextResponse = await this.textractClient.send(nextCommand);

            if (nextResponse.Blocks) {
              for (const block of nextResponse.Blocks) {
                if (block.BlockType === 'LINE' && block.Text) {
                  extractedText += block.Text + '\n';
                  if (block.Confidence) {
                    totalConfidence += block.Confidence;
                    confidenceCount++;
                  }
                }
                if (block.Page) {
                  pages.add(block.Page);
                }
              }
            }

            nextToken = nextResponse.NextToken;
          }

          const avgConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0;
          
          this.logger.log(`PDF extraction completed. Pages: ${pages.size}, Confidence: ${avgConfidence.toFixed(2)}%`);

          return {
            text: extractedText.trim(),
            confidence: avgConfidence,
            pageCount: pages.size,
          };
        } else if (jobStatus === 'FAILED') {
          throw new BadRequestException('Textract job failed');
        }

        attempts++;
      }

      if (attempts >= maxAttempts) {
        throw new BadRequestException('Textract job timed out after 2 minutes');
      }

      throw new BadRequestException(`Unexpected job status: ${jobStatus}`);
    } catch (error) {
      this.logger.error(`Async PDF extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Summarize text using AWS Bedrock Claude 3.5 Sonnet
   */
  async summarizeText(text: string, documentType: string = 'business document'): Promise<string> {
    const startTime = Date.now();
    this.logger.log(`Starting Bedrock summarization for ${documentType}`);

    try {
      // Enterprise-focused prompt for business documents
      const prompt = `Bạn là trợ lý AI chuyên phân tích văn bản doanh nghiệp. Hãy đọc kỹ văn bản sau và tạo một bản tóm tắt chuyên nghiệp theo cấu trúc sau:

**THÔNG TIN CHÍNH:**
- Loại văn bản và mục đích
- Các bên liên quan (nếu có)
- Ngày tháng quan trọng

**NỘI DUNG CHÍNH:**
- Các điểm quan trọng (3-5 điểm, dạng bullet points)
- Số liệu, con số nổi bật (nếu có)

**HÀNH ĐỘNG YÊU CẦU:**
- Các nhiệm vụ cần thực hiện
- Deadline (nếu có)
- Người phụ trách (nếu được nêu)

**GHI CHÚ:**
- Các điều khoản đặc biệt hoặc lưu ý quan trọng

Văn bản cần tóm tắt:

${text}

Hãy trả lời bằng tiếng Việt, ngắn gọn, rõ ràng và tập trung vào thông tin quan trọng nhất cho quản lý doanh nghiệp.`;

      const requestBody = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
        temperature: 0.3,
        top_p: 0.9,
      };

      const command = new InvokeModelCommand({
        modelId: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(requestBody),
      });

      const response = await this.bedrockClient.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      const summary = responseBody.content?.[0]?.text || 'Không thể tạo tóm tắt';
      const processingTime = Date.now() - startTime;

      this.logger.log(`Bedrock summarization completed in ${processingTime}ms`);

      return summary;
    } catch (error) {
      this.logger.error(`Bedrock summarization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new BadRequestException('Failed to generate summary');
    }
  }

  /**
   * Analyze document: Extract text with Textract + Summarize with Bedrock
   */
  async analyzeDocument(documentId: string, s3Key: string): Promise<DocumentAnalysisResult> {
    const startTime = Date.now();
    this.logger.log(`Starting full document analysis for: ${documentId}`);

    try {
      // Step 1: Extract text with Textract
      const { text, confidence, pageCount } = await this.extractTextFromDocument(s3Key);

      if (!text || text.length < 50) {
        throw new BadRequestException('Extracted text is too short or empty. Document may be unreadable.');
      }

      // Step 2: Summarize with Bedrock
      const summary = await this.summarizeText(text);

      const totalProcessingTime = Date.now() - startTime;

      this.logger.log(`Document analysis completed in ${totalProcessingTime}ms`);

      return {
        documentId,
        extractedText: text,
        summary,
        confidence,
        pageCount,
        processingTime: totalProcessingTime,
      };
    } catch (error) {
      this.logger.error(`Document analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Perform OCR on document (legacy method)
   */
  async performOcr(ocrRequest: OcrRequestDto): Promise<OcrResult> {
    this.logger.log(`Starting OCR for file: ${ocrRequest.fileSource} with language: ${ocrRequest.language || OcrLanguage.VIETNAMESE}`);

    try {
      const { text, confidence, pageCount } = await this.extractTextFromDocument(ocrRequest.fileSource);
      
      const result: OcrResult = {
        text,
        confidence,
        language: ocrRequest.language || OcrLanguage.VIETNAMESE,
        processingTime: 0,
        pageCount,
      };

      this.logger.log(`OCR completed for file: ${ocrRequest.fileSource}`);
      return result;
    } catch (error) {
      this.logger.error(`OCR failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new BadRequestException('OCR processing failed');
    }
  }

  /**
   * Extract text from image/PDF
   */
  async extractText(fileBuffer: Buffer, language: OcrLanguage = OcrLanguage.VIETNAMESE): Promise<string> {
    this.logger.log(`Extracting text with language: ${language}`);
    
    // TODO: Implement text extraction
    return 'Text extraction not yet implemented';
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages(): string[] {
    return Object.values(OcrLanguage);
  }
}
