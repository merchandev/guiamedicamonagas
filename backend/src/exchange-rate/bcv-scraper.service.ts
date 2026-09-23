import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as https from 'node:https';
import * as tls from 'node:tls';
import * as cheerio from 'cheerio';
import { ExchangeRateService } from './exchange-rate.service';

const BCV_URL = 'https://www.bcv.org.ve/';
const FETCH_TIMEOUT_MS = 15_000;

// El servidor del BCV no envía su certificado intermedio en el handshake TLS
// (solo el certificado hoja `*.bcv.org.ve`) — confirmado con
// `openssl s_client -showcerts -connect www.bcv.org.ve:443`, que devuelve
// "unable to verify the first certificate". La raíz (Sectigo Public Server
// Authentication Root R46) sí está en el almacén de confianza por defecto de
// Node; solo falta este intermedio, que es el que la propia extensión AIA
// del certificado del BCV apunta como "CA Issuers"
// (http://crt.sectigo.com/SectigoPublicServerAuthenticationCADVR36.crt).
// Se agrega explícitamente en vez de desactivar la verificación
// (`rejectUnauthorized`), que sería inseguro.
const BCV_INTERMEDIATE_CA = `-----BEGIN CERTIFICATE-----
MIIGTDCCBDSgAwIBAgIQOXpmzCdWNi4NqofKbqvjsTANBgkqhkiG9w0BAQwFADBf
MQswCQYDVQQGEwJHQjEYMBYGA1UEChMPU2VjdGlnbyBMaW1pdGVkMTYwNAYDVQQD
Ey1TZWN0aWdvIFB1YmxpYyBTZXJ2ZXIgQXV0aGVudGljYXRpb24gUm9vdCBSNDYw
HhcNMjEwMzIyMDAwMDAwWhcNMzYwMzIxMjM1OTU5WjBgMQswCQYDVQQGEwJHQjEY
MBYGA1UEChMPU2VjdGlnbyBMaW1pdGVkMTcwNQYDVQQDEy5TZWN0aWdvIFB1Ymxp
YyBTZXJ2ZXIgQXV0aGVudGljYXRpb24gQ0EgRFYgUjM2MIIBojANBgkqhkiG9w0B
AQEFAAOCAY8AMIIBigKCAYEAljZf2HIz7+SPUPQCQObZYcrxLTHYdf1ZtMRe7Yeq
RPSwygz16qJ9cAWtWNTcuICc++p8Dct7zNGxCpqmEtqifO7NvuB5dEVexXn9RFFH
12Hm+NtPRQgXIFjx6MSJcNWuVO3XGE57L1mHlcQYj+g4hny90aFh2SCZCDEVkAja
EMMfYPKuCjHuuF+bzHFb/9gV8P9+ekcHENF2nR1efGWSKwnfG5RawlkaQDpRtZTm
M64TIsv/r7cyFO4nSjs1jLdXYdz5q3a4L0NoabZfbdxVb+CUEHfB0bpulZQtH1Rv
38e/lIdP7OTTIlZh6OYL6NhxP8So0/sht/4J9mqIGxRFc0/pC8suja+wcIUna0HB
pXKfXTKpzgis+zmXDL06ASJf5E4A2/m+Hp6b84sfPAwQ766rI65mh50S0Di9E3Pn
2WcaJc+PILsBmYpgtmgWTR9eV9otfKRUBfzHUHcVgarub/XluEpRlTtZudU5xbFN
xx/DgMrXLUAPaI60fZ6wA+PTAgMBAAGjggGBMIIBfTAfBgNVHSMEGDAWgBRWc1hk
lfmSGrASKgRieaFAFYghSTAdBgNVHQ4EFgQUaMASFhgOr872h6YyV6NGUV3LBycw
DgYDVR0PAQH/BAQDAgGGMBIGA1UdEwEB/wQIMAYBAf8CAQAwHQYDVR0lBBYwFAYI
KwYBBQUHAwEGCCsGAQUFBwMCMBsGA1UdIAQUMBIwBgYEVR0gADAIBgZngQwBAgEw
VAYDVR0fBE0wSzBJoEegRYZDaHR0cDovL2NybC5zZWN0aWdvLmNvbS9TZWN0aWdv
UHVibGljU2VydmVyQXV0aGVudGljYXRpb25Sb290UjQ2LmNybDCBhAYIKwYBBQUH
AQEEeDB2ME8GCCsGAQUFBzAChkNodHRwOi8vY3J0LnNlY3RpZ28uY29tL1NlY3Rp
Z29QdWJsaWNTZXJ2ZXJBdXRoZW50aWNhdGlvblJvb3RSNDYucDdjMCMGCCsGAQUF
BzABhhdodHRwOi8vb2NzcC5zZWN0aWdvLmNvbTANBgkqhkiG9w0BAQwFAAOCAgEA
YtOC9Fy+TqECFw40IospI92kLGgoSZGPOSQXMBqmsGWZUQ7rux7cj1du6d9rD6C8
ze1B2eQjkrGkIL/OF1s7vSmgYVafsRoZd/IHUrkoQvX8FZwUsmPu7amgBfaY3g+d
q1x0jNGKb6I6Bzdl6LgMD9qxp+3i7GQOnd9J8LFSietY6Z4jUBzVoOoz8iAU84OF
h2HhAuiPw1ai0VnY38RTI+8kepGWVfGxfBWzwH9uIjeooIeaosVFvE8cmYUB4TSH
5dUyD0jHct2+8ceKEtIoFU/FfHq/mDaVnvcDCZXtIgitdMFQdMZaVehmObyhRdDD
4NQCs0gaI9AAgFj4L9QtkARzhQLNyRf87Kln+YU0lgCGr9HLg3rGO8q+Y4ppLsOd
unQZ6ZxPNGIfOApbPVf5hCe58EZwiWdHIMn9lPP6+F404y8NNugbQixBber+x536
WrZhFZLjEkhp7fFXf9r32rNPfb74X/U90Bdy4lzp3+X1ukh1BuMxA/EEhDoTOS3l
7ABvc7BYSQubQ2490OcdkIzUh3ZwDrakMVrbaTxUM2p24N6dB+ns2zptWCva6jzW
r8IWKIMxzxLPv5Kt3ePKcUdvkBU/smqujSczTzzSjIoR5QqQA6lN1ZRSnuHIWCvh
JEltkYnTAH41QJ6SAWO66GrrUESwN/cgZzL4JLEqz1Y=
-----END CERTIFICATE-----`;

// `ca` reemplaza el almacén de confianza por defecto en vez de extenderlo,
// así que hay que incluir explícitamente las raíces conocidas de Node junto
// con el intermedio que falta.
const bcvAgent = new https.Agent({ ca: [...tls.rootCertificates, BCV_INTERMEDIATE_CA] });

/**
 * Obtiene el tipo de cambio oficial USD del sitio del BCV (scraping del
 * bloque `#dolar` de su home) y lo guarda como la tasa vigente de la
 * plataforma. El BCV publica la tasa una vez al día, así que sincronizamos
 * cada hora — suficiente para reflejar el cambio del día sin martillar su
 * servidor — más una vez al iniciar el backend.
 */
@Injectable()
export class BcvScraperService implements OnModuleInit {
  private readonly logger = new Logger(BcvScraperService.name);
  private syncing = false;

  constructor(private readonly exchangeRate: ExchangeRateService) {}

  async onModuleInit() {
    // No bloquea el arranque del backend: corre en segundo plano.
    void this.syncNow();
  }

  @Cron('0 * * * *')
  async scheduledSync() {
    await this.syncNow();
  }

  /** Descarga y parsea la home del BCV. Nunca lanza: siempre resuelve con éxito o registra el fallo. */
  async syncNow(): Promise<{ ok: true; usdToBs: number } | { ok: false; error: string }> {
    if (this.syncing) {
      return { ok: false, error: 'Ya hay una sincronización en curso' };
    }
    this.syncing = true;
    try {
      const usdToBs = await this.fetchRate();
      await this.exchangeRate.setFromBcv(usdToBs);
      return { ok: true, usdToBs };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      await this.exchangeRate.recordBcvSyncFailure(message);
      return { ok: false, error: message };
    } finally {
      this.syncing = false;
    }
  }

  private async fetchRate(): Promise<number> {
    const html = await this.fetchHtml();
    const $ = cheerio.load(html);
    const rawValue = $('#dolar .strong-tb').first().text().trim();
    if (!rawValue) {
      throw new Error('No se encontró el valor del dólar en la página del BCV (el sitio pudo haber cambiado)');
    }

    // Formato venezolano: punto como separador de miles, coma como decimal (ej. "1.852,4168").
    const normalized = rawValue.replace(/\./g, '').replace(',', '.');
    const value = Number(normalized);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`Valor de tasa inválido recibido del BCV: "${rawValue}"`);
    }

    return value;
  }

  private fetchHtml(): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = https.request(
        BCV_URL,
        {
          agent: bcvAgent,
          headers: {
            // Un user-agent de navegador evita bloqueos por parte del WAF del BCV.
            'User-Agent': 'Mozilla/5.0 (compatible; GuiaMedicaMonagas/1.0; +https://guiamedicamonagas.com)',
          },
          timeout: FETCH_TIMEOUT_MS,
        },
        (res) => {
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            res.resume();
            reject(new Error(`El sitio del BCV respondió con estado ${res.statusCode}`));
            return;
          }
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
          res.on('error', reject);
        },
      );
      req.on('timeout', () => req.destroy(new Error('Tiempo de espera agotado al consultar el sitio del BCV')));
      req.on('error', reject);
      req.end();
    });
  }
}
