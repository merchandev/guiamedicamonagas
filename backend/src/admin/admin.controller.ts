import { Controller, Get } from '@nestjs/common';
import { AdminService } from './admin.service';
import { Permission, RequirePermissions } from '../common/permissions';

@RequirePermissions(Permission.VIEW_ADMIN_STATS)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('stats')
  getStats() {
    return this.admin.getStats();
  }
}
