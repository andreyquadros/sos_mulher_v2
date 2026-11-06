import { z } from 'zod';
import { ApiError } from './security.js';

const uf = z.enum(['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']);

export const addressSchema = z.object({
  address: z.object({
    street: z.string().trim().min(1).max(180),
    number: z.string().trim().max(30).default(''),
    complement: z.string().trim().max(120).default(''),
    district: z.string().trim().max(120).default(''),
    city: z.string().trim().min(1).max(120),
    state: z.string().trim().toUpperCase().pipe(uf),
    postalCode: z.string().trim().regex(/^(?:\d{5}-?\d{3})?$/).transform(value => value.replace(/^(\d{5})(\d{3})$/, '$1-$2')).default(''),
    reference: z.string().trim().max(200).default(''),
  }).strict().nullable(),
}).strict();

export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
type AttachmentMimeType = typeof ATTACHMENT_MIME_TYPES[number];

export const DOSSIER_ACTION = {
  view: 'woman.dossier_viewed',
  address: 'woman.address_updated',
  addAttachment: 'woman.attachment_added',
  downloadAttachment: 'woman.attachment_downloaded',
} as const;
export const DOSSIER_CHANGES = [DOSSIER_ACTION.address, DOSSIER_ACTION.addAttachment] as const;

const pngHeader = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
const pngEnd = Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
const jpegHeader = Buffer.from([255, 216, 255]);
const jpegEnd = Buffer.from([255, 217]);

const attachmentTypes = {
  'application/pdf': {
    extension: /\.pdf$/i, fallback: 'anexo.pdf',
    matches: (data: Buffer) => /^%PDF-\d\.\d/.test(data.subarray(0, 8).toString('latin1')) &&
      /%%EOF[\r\n\t ]*$/.test(data.subarray(-1024).toString('latin1')),
  },
  'image/jpeg': {
    extension: /\.jpe?g$/i, fallback: 'anexo.jpg',
    matches: (data: Buffer) => data.length > 5 &&
      data.subarray(0, jpegHeader.length).equals(jpegHeader) && data.subarray(-jpegEnd.length).equals(jpegEnd),
  },
  'image/png': {
    extension: /\.png$/i, fallback: 'anexo.png',
    matches: (data: Buffer) => data.length > 45 &&
      data.subarray(0, pngHeader.length).equals(pngHeader) && data.subarray(-pngEnd.length).equals(pngEnd),
  },
} satisfies Record<AttachmentMimeType, { extension: RegExp; fallback: string; matches: (data: Buffer) => boolean }>;

function isAttachmentType(value: string | undefined): value is AttachmentMimeType {
  return ATTACHMENT_MIME_TYPES.some(type => type === value);
}

export function parseAttachment(mimeType: string | undefined, encodedName: string | string[] | undefined, data: unknown) {
  if (!isAttachmentType(mimeType)) throw new ApiError(415, 'Envie um arquivo PDF, JPEG ou PNG.');
  if (typeof encodedName !== 'string' || encodedName.length > 1440) throw new ApiError(400, 'Informe um nome válido para o anexo.');
  let name: string;
  try { name = decodeURIComponent(encodedName).normalize('NFC').trim(); }
  catch { throw new ApiError(400, 'Informe um nome válido para o anexo.'); }
  const type = attachmentTypes[mimeType];
  if (name.length < 5 || name.length > 120 || name.startsWith('.') || /[\\/:*?"<>|\p{Cc}\p{Cf}]/u.test(name) || !type.extension.test(name)) {
    throw new ApiError(400, 'Nome do anexo inválido ou extensão incompatível com o arquivo.');
  }
  if (!Buffer.isBuffer(data) || data.length === 0) throw new ApiError(400, 'Arquivo vazio.');
  if (data.length > ATTACHMENT_MAX_BYTES) throw new ApiError(413, 'Limite de 5 MiB por anexo.');
  if (!type.matches(data)) throw new ApiError(415, 'O conteúdo do arquivo não corresponde ao tipo informado.');
  return { name, mimeType, data };
}

export function attachmentDisposition(name: string, mimeType: string) {
  const fallback = isAttachmentType(mimeType) ? attachmentTypes[mimeType].fallback : 'anexo';
  const encoded = encodeURIComponent(name).replace(/['()*]/g, character => '%' + character.charCodeAt(0).toString(16).toUpperCase());
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
