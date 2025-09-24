import { PartialType } from '@nestjs/swagger';
import { CreateSignatureRequestDto } from './create-signature-request.dto';

export class UpdateSignatureRequestDto extends PartialType(CreateSignatureRequestDto) {}
