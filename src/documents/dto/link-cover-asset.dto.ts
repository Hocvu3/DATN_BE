import { IsString, IsNumber, IsOptional, Min, IsNotEmpty, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LinkCoverAssetDto {
    @ApiProperty({
        example: 'documents/covers/2024/01/15/cover-image.jpg',
        description: 'S3 object key of the uploaded cover image',
    })
    @IsString()
    @IsNotEmpty()
    s3Key!: string;

    @ApiProperty({
        example: 'cover-image.jpg',
        description: 'Original filename of the cover image',
    })
    @IsString()
    @IsNotEmpty()
    filename!: string;

    @ApiProperty({
        example: 'image/jpeg',
        description: 'MIME type of the cover image (must be image type)',
    })
    @IsString()
    @IsNotEmpty()
    contentType!: string;

    @ApiProperty({
        example: 512000,
        description: 'Size of the cover image in bytes (optional)',
        required: false,
    })
    @IsOptional()
    @IsNumber()
    @Min(1)
    sizeBytes?: number;

    @ApiProperty({
        example: true,
        description: 'Mark this asset as cover image',
        default: true,
    })
    @IsOptional()
    @IsBoolean()
    isCover?: boolean = true;
}