import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { SeoService } from './seo.service';
import { UpdateGlobalSeoDto, UpsertPageSeoDto } from './dto/update-global-seo.dto';

@Controller('seo')
export class SeoController {
  constructor(private readonly seo: SeoService) {}

  @Public()
  @Get('global')
  getGlobal() {
    return this.seo.getGlobal();
  }

  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @Put('global')
  updateGlobal(@Body() dto: UpdateGlobalSeoDto) {
    return this.seo.updateGlobal(dto);
  }

  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @Get('pages')
  listPages() {
    return this.seo.listPages();
  }

  @Public()
  @Get('pages/meta')
  getPublicMeta(@Query('path') path: string) {
    return this.seo.getPublicMetaForPath(path ?? '/');
  }

  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @Put('pages')
  upsertPage(@Body() dto: UpsertPageSeoDto) {
    return this.seo.upsertPage(dto);
  }
}
