import { Module, Global } from '@nestjs/common';
import { S3Module } from '../s3/s3.module';
import { CryptoService } from './services/crypto.service';

@Global()
@Module({
  imports: [S3Module],
  providers: [CryptoService],
  exports: [CryptoService],
})
export class CommonModule {}
