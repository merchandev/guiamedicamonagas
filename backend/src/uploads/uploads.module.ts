import { Global, Module } from '@nestjs/common';
import { UploadSecurityService } from './upload-security.service';

@Global()
@Module({
  providers: [UploadSecurityService],
  exports: [UploadSecurityService],
})
export class UploadsModule {}
