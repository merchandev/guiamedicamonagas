import { describe, expect, it } from 'vitest';
import { newsletterEmail, renderNewsletterBlocks, type NewsletterBlock } from '../../src/mail/mail.templates';
import { NewsletterService } from '../../src/newsletter/newsletter.service';

describe('render de bloques del boletín', () => {
  it('escapa el HTML del texto para evitar inyección', () => {
    const html = renderNewsletterBlocks([
      { type: 'heading', text: '<script>alert(1)</script>' },
      { type: 'paragraph', text: 'Hola <b>mundo</b>\nsegunda línea' },
    ]);
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('<br/>'); // los saltos de línea se conservan como <br/>
  });

  it('neutraliza URLs peligrosas en botones e imágenes', () => {
    const html = renderNewsletterBlocks([
      { type: 'button', text: 'Clic', url: 'javascript:alert(1)' },
      { type: 'image', url: 'https://cdn.example.com/foto.png', alt: 'foto' },
      { type: 'divider' },
    ]);
    expect(html).not.toContain('javascript:');
    expect(html).toContain('href="#"');
    expect(html).toContain('https://cdn.example.com/foto.png');
    expect(html).toContain('<hr');
  });

  it('la envoltura incluye el enlace de baja', () => {
    const html = newsletterEmail({ subject: 'Hola', bodyHtml: '<p>x</p>', unsubscribeUrl: 'https://sitio/boletin/baja?token=abc' });
    expect(html).toContain('https://sitio/boletin/baja?token=abc');
    expect(html).toContain('cancela tu suscripción');
  });

  it('incluye el píxel de apertura solo cuando se pasa la URL de seguimiento', () => {
    const withPixel = newsletterEmail({
      subject: 'Hola',
      bodyHtml: '<p>x</p>',
      unsubscribeUrl: 'https://sitio/boletin/baja?token=abc',
      trackingPixelUrl: 'https://api/newsletter/t/o/dlv-1',
    });
    expect(withPixel).toContain('https://api/newsletter/t/o/dlv-1');
    const withoutPixel = newsletterEmail({ subject: 'Hola', bodyHtml: '<p>x</p>', unsubscribeUrl: 'https://sitio/baja' });
    expect(withoutPixel).not.toContain('/t/o/');
  });
});

describe('audiencia: dedupe, supresión y filtro por rol', () => {
  function serviceWith(prisma: unknown) {
    const mail = { send: async () => true };
    const config = { get: () => 'http://localhost:3000' };
    return new NewsletterService(prisma as never, mail as never, config as never);
  }

  const dto = {
    subject: 's',
    contentMode: 'BLOCKS' as const,
    blocks: [] as NewsletterBlock[],
    rawHtml: undefined,
    audienceList: true,
    audiencePatients: true,
    audienceProfessionals: false,
  };

  it('une lista y usuarios, deduplica por correo y excluye a los dados de baja', async () => {
    const prisma = {
      newsletterSubscriber: {
        findMany: async ({ where }: { where: { status?: string } }) => {
          if (where.status === 'UNSUBSCRIBED') return [{ email: 'gone@x.com' }];
          if (where.status === 'ACTIVE') return [{ email: 'a@x.com' }, { email: 'dup@x.com' }];
          return [];
        },
      },
      user: {
        findMany: async () => [
          { id: 'u1', email: 'DUP@x.com' }, // mismo correo que la lista (distinta capitalización)
          { id: 'u2', email: 'b@x.com' },
          { id: 'u3', email: 'gone@x.com' }, // dado de baja: se excluye
        ],
      },
    };
    const service = serviceWith(prisma);
    const result = await service.estimateAudience(dto as never);
    // a@, dup@ (deduplicado), b@ => 3; gone@ excluido por supresión.
    expect(result.total).toBe(3);
  });

  it('sin audiencias seleccionadas no hay destinatarios', async () => {
    const prisma = {
      newsletterSubscriber: { findMany: async () => [] },
      user: { findMany: async () => [] },
    };
    const service = serviceWith(prisma);
    const result = await service.estimateAudience({ ...dto, audienceList: false, audiencePatients: false } as never);
    expect(result.total).toBe(0);
  });
});
