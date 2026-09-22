import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateGlobalSeoDto, UpsertPageSeoDto } from './dto/update-global-seo.dto';

const GLOBAL_SEO_KEY = 'seo_global';

export interface GlobalSeoConfig {
  siteName: string;
  titleSeparator: string;
  allowIndexing: boolean;
  defaultOgImageUrl?: string;
}

const DEFAULT_GLOBAL_SEO: GlobalSeoConfig = {
  siteName: 'Guía Médica Monagas',
  titleSeparator: '-',
  allowIndexing: true,
};

@Injectable()
export class SeoService {
  constructor(private readonly prisma: PrismaService) {}

  async getGlobal(): Promise<GlobalSeoConfig> {
    const row = await this.prisma.siteSettings.findUnique({ where: { key: GLOBAL_SEO_KEY } });
    return { ...DEFAULT_GLOBAL_SEO, ...(row?.value as Partial<GlobalSeoConfig> | undefined) };
  }

  async updateGlobal(dto: UpdateGlobalSeoDto) {
    await this.prisma.siteSettings.upsert({
      where: { key: GLOBAL_SEO_KEY },
      create: { key: GLOBAL_SEO_KEY, value: dto as never },
      update: { value: dto as never },
    });
    return this.getGlobal();
  }

  listPages() {
    return this.prisma.pageSeo.findMany({ orderBy: { path: 'asc' } });
  }

  async upsertPage(dto: UpsertPageSeoDto) {
    return this.prisma.pageSeo.upsert({
      where: { path: dto.path },
      create: dto,
      update: dto,
    });
  }

  /** Metadata lista para usar en generateMetadata() del frontend para una ruta estática. */
  async getPublicMetaForPath(path: string) {
    const [global, page] = await Promise.all([
      this.getGlobal(),
      this.prisma.pageSeo.findUnique({ where: { path } }),
    ]);
    const title = page?.title ? `${page.title} ${global.titleSeparator} ${global.siteName}` : global.siteName;
    return {
      title,
      description: page?.metaDescription ?? undefined,
      ogImage: page?.ogImageUrl ?? global.defaultOgImageUrl,
      noIndex: page?.noIndex ?? !global.allowIndexing,
    };
  }
}
