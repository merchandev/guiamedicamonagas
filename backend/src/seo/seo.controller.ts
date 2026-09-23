import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { SeoService } from './seo.service';
import { UpdateGlobalSeoDto, UpsertPageSeoDto } from './dto/update-global-seo.dto';
import { Permission, RequirePermissions } from '../common/permissions';

@Controller('seo')
export class SeoController {
  constructor(private readonly seo: SeoService) {}

  @Public()
  @Get('global')
  getGlobal() {
    return this.seo.getGlobal();
  }

  @RequirePermissions(Permission.MANAGE_SITE)
  @Put('global')
  updateGlobal(@Body() dto: UpdateGlobalSeoDto) {
    return this.seo.updateGlobal(dto);
  }

  @RequirePermissions(Permission.MANAGE_SITE)
  @Get('pages')
  listPages() {
    return this.seo.listPages();
  }

  @Public()
  @Get('pages/meta')
  getPublicMeta(@Query('path') path: string) {
    return this.seo.getPublicMetaForPath(path ?? '/');
  }

  @RequirePermissions(Permission.MANAGE_SITE)
  @Put('pages')
  upsertPage(@Body() dto: UpsertPageSeoDto) {
    return this.seo.upsertPage(dto);
  }
}
