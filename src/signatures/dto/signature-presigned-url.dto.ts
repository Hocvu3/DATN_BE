import { IsString, IsNotEmpty, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SignaturePresignedUrlDto {
  @ApiProperty({
    example: 'ceo-signature.png',
    description: 'Name of the signature image file to upload',
  })
  @IsString()
  @IsNotEmpty()
  fileName!: string;

  @ApiProperty({
    example: 'image/png',
    description: 'MIME type of the signature image (must be image/*)',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^image\/(png|jpg|jpeg|gif|webp|svg\+xml)$/, {
    message: 'Content type must be a valid image MIME type (image/png, image/jpeg, etc.)',
  })
  contentType!: string;
}
