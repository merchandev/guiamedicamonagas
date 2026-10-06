/**
 * A quién avisar de cada cambio de la bandeja `RealtimeEvent`.
 *
 * Los avisos solo dicen «cambió algo de este tema» (y, en las salas privadas,
 * el identificador de la fila); nunca contenido. Quien lo recibe vuelve a pedir
 * los datos a la API con su sesión y sus permisos de siempre.
 *
 * Salas:
 * - `user:<id>`: los dispositivos de esa cuenta.
 * - `pro:<id>`: el médico dueño de ese perfil.
 * - `org:<id>`: los miembros de esa organización.
 * - `staff`: administración.
 * - `pub:pro:<id>`: quien mira la ficha pública de ese médico (horarios libres).
 * - `all`: todos (directorio y catálogos públicos).
 */

export const REALTIME_TOPICS = [
  'appointments',
  'schedule',
  'availability',
  'notifications',
  'contact',
  'prescriptions',
  'documents',
  'profile',
  'directory',
  'posts',
  'billing',
  'reviews',
  'access',
  'patientProfile',
  'identities',
  'clinical',
  'finance',
  'account',
  'requests',
  'organization',
  'catalog',
] as const;
export type RealtimeTopic = (typeof REALTIME_TOPICS)[number];

export type RealtimeRoom = 'all' | 'staff' | `user:${string}` | `pro:${string}` | `org:${string}` | `pub:pro:${string}`;

export interface CapturedEvent {
  id: string;
  source: string;
  op: string;
  rowId: string | null;
  keys: Record<string, unknown>;
}

/** Datos de la base para saber de quién es cada fila que no lo dice sola. */
export interface AudienceLookups {
  /** PatientProfile.id → userId de su cuenta (null si es una ficha sin cuenta). */
  patientUser: Map<string, string | null>;
  /** Schedule.id → professionalId. */
  scheduleOwner: Map<string, string>;
  /** Subscription.id → dueño (médico u organización). */
  subscriptionOwner: Map<string, { professionalId: string | null; organizationId: string | null }>;
  /** SubscriptionInstallment.id → subscriptionId. */
  installmentSubscription: Map<string, string>;
  /** Review.id → médico y paciente. */
  reviewOwner: Map<string, { professionalId: string; patientId: string }>;
}

export interface RealtimeDelivery {
  room: RealtimeRoom;
  topic: RealtimeTopic;
  /** Identificador de la fila (solo en salas privadas). */
  ref?: string;
}

export function emptyLookups(): AudienceLookups {
  return {
    patientUser: new Map(),
    scheduleOwner: new Map(),
    subscriptionOwner: new Map(),
    installmentSubscription: new Map(),
    reviewOwner: new Map(),
  };
}

/** Valores de una clave y de su versión anterior (si la fila cambió de dueño), sin repetir. */
export function keyValues(event: CapturedEvent, name: string): string[] {
  const values = [event.keys[name], event.keys[`old_${name}`]].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  return [...new Set(values)];
}

/** Identificadores que hay que buscar en la base antes de repartir un lote. */
export function lookupNeeds(events: CapturedEvent[]) {
  const needs = {
    patientIds: new Set<string>(),
    scheduleIds: new Set<string>(),
    subscriptionIds: new Set<string>(),
    installmentIds: new Set<string>(),
    reviewIds: new Set<string>(),
  };
  for (const event of events) {
    switch (event.source) {
      case 'Appointment':
      case 'Prescription':
      case 'Review':
      case 'PatientDataGrant':
      case 'ProfessionalPatient':
        keyValues(event, 'patientId').forEach((id) => needs.patientIds.add(id));
        break;
      case 'ScheduleBlock':
      case 'ScheduleException':
        keyValues(event, 'scheduleId').forEach((id) => needs.scheduleIds.add(id));
        break;
      case 'SubscriptionInstallment':
        keyValues(event, 'subscriptionId').forEach((id) => needs.subscriptionIds.add(id));
        break;
      case 'Payment':
        keyValues(event, 'installmentId').forEach((id) => needs.installmentIds.add(id));
        break;
      case 'ReviewReply':
      case 'ReviewReport':
        keyValues(event, 'reviewId').forEach((id) => needs.reviewIds.add(id));
        break;
    }
  }
  return needs;
}

/** Cuentas cuyas salas o cuya sesión hay que revisar por este cambio. */
export function sessionUsersFor(event: CapturedEvent): string[] {
  switch (event.source) {
    case 'User':
      return keyValues(event, 'id');
    case 'UserSanction':
    case 'OrganizationMember':
      return keyValues(event, 'userId');
    case 'ProfessionalProfile':
      // Un perfil nuevo: sus dispositivos ya conectados entran a su sala de médico.
      return event.op === 'INSERT' ? keyValues(event, 'userId') : [];
    default:
      return [];
  }
}

export function deliveriesFor(event: CapturedEvent, lookups: AudienceLookups): RealtimeDelivery[] {
  const out: RealtimeDelivery[] = [];
  const ref = event.rowId ?? undefined;
  const add = (room: RealtimeRoom, topic: RealtimeTopic, withRef = true) =>
    out.push(withRef && ref && !room.startsWith('pub:') && room !== 'all' ? { room, topic, ref } : { room, topic });
  const pros = (ids: string[], topic: RealtimeTopic) => ids.forEach((id) => add(`pro:${id}`, topic));
  const users = (ids: string[], topic: RealtimeTopic) => ids.forEach((id) => add(`user:${id}`, topic));
  const orgs = (ids: string[], topic: RealtimeTopic) => ids.forEach((id) => add(`org:${id}`, topic));
  const publicPro = (ids: string[], topic: RealtimeTopic) => ids.forEach((id) => add(`pub:pro:${id}`, topic, false));
  const patientUsers = (patientIds: string[]) =>
    patientIds.map((id) => lookups.patientUser.get(id)).filter((id): id is string => !!id);
  const k = (name: string) => keyValues(event, name);

  switch (event.source) {
    case 'Appointment': {
      const professionals = k('professionalId');
      pros(professionals, 'appointments');
      users(patientUsers(k('patientId')), 'appointments');
      publicPro(professionals, 'availability');
      break;
    }
    case 'Schedule':
      pros(k('professionalId'), 'schedule');
      publicPro(k('professionalId'), 'availability');
      break;
    case 'ScheduleBlock':
    case 'ScheduleException': {
      const professionals = k('scheduleId')
        .map((id) => lookups.scheduleOwner.get(id))
        .filter((id): id is string => !!id);
      pros(professionals, 'schedule');
      publicPro(professionals, 'availability');
      break;
    }
    case 'ClinicalNote':
      pros(k('professionalId'), 'clinical');
      break;
    case 'FinanceRecord':
      pros(k('professionalId'), 'finance');
      break;
    case 'Notification':
      users(k('userId'), 'notifications');
      break;
    case 'ContactMessage':
      pros(k('professionalId'), 'contact');
      users(k('patientUserId'), 'contact');
      add('staff', 'contact', false);
      break;
    case 'Prescription':
      pros(k('professionalId'), 'prescriptions');
      users(patientUsers(k('patientId')), 'prescriptions');
      break;
    case 'PrescriptionPad':
      pros(k('professionalId'), 'prescriptions');
      break;
    case 'ProfessionalProfile':
      pros(k('id'), 'profile');
      users(k('userId'), 'profile');
      publicPro(k('id'), 'profile');
      add('staff', 'profile', false);
      add('all', 'directory');
      break;
    case 'ProfessionalDocument':
      pros(k('professionalId'), 'documents');
      add('staff', 'documents');
      break;
    case 'ProfessionalRegistration':
      pros(k('professionalId'), 'profile');
      add('staff', 'profile', false);
      break;
    case 'ProfessionalLocation':
    case 'ProfessionalSocialLink':
    case 'ProfessionalSpecialty':
      pros(k('professionalId'), 'profile');
      publicPro(k('professionalId'), 'profile');
      add('all', 'directory');
      break;
    case 'Post':
      pros(k('professionalId'), 'posts');
      publicPro(k('professionalId'), 'profile');
      break;
    case 'Subscription':
      pros(k('professionalId'), 'billing');
      orgs(k('organizationId'), 'billing');
      add('staff', 'billing', false);
      break;
    case 'SubscriptionInstallment':
    case 'Payment': {
      const subscriptionIds =
        event.source === 'Payment'
          ? k('installmentId')
              .map((id) => lookups.installmentSubscription.get(id))
              .filter((id): id is string => !!id)
          : k('subscriptionId');
      for (const id of subscriptionIds) {
        const owner = lookups.subscriptionOwner.get(id);
        if (owner?.professionalId) add(`pro:${owner.professionalId}`, 'billing');
        if (owner?.organizationId) add(`org:${owner.organizationId}`, 'billing');
      }
      add('staff', 'billing', false);
      break;
    }
    case 'Review':
    case 'ReviewReply':
    case 'ReviewReport': {
      const owners =
        event.source === 'Review'
          ? [{ professionalIds: k('professionalId'), patientIds: k('patientId') }]
          : k('reviewId')
              .map((id) => lookups.reviewOwner.get(id))
              .filter((owner): owner is { professionalId: string; patientId: string } => !!owner)
              .map((owner) => ({ professionalIds: [owner.professionalId], patientIds: [owner.patientId] }));
      for (const owner of owners) {
        pros(owner.professionalIds, 'reviews');
        users(patientUsers(owner.patientIds), 'reviews');
        publicPro(owner.professionalIds, 'profile');
      }
      add('staff', 'reviews', false);
      break;
    }
    case 'PatientProfile':
      users(k('userId'), 'patientProfile');
      add('staff', 'identities', false);
      break;
    case 'PatientDataGrant':
    case 'ProfessionalPatient':
      pros(k('professionalId'), 'access');
      users(patientUsers(k('patientId')), 'access');
      break;
    case 'User':
      users(k('id'), 'account');
      add('staff', 'account', false);
      break;
    case 'UserSanction':
      users(k('userId'), 'account');
      add('staff', 'reviews', false);
      break;
    case 'LegalRequest':
      users(k('userId'), 'requests');
      add('staff', 'requests', false);
      break;
    case 'Organization':
      orgs(k('id'), 'organization');
      add('staff', 'organization', false);
      add('all', 'directory');
      break;
    case 'OrganizationMember':
      orgs(k('organizationId'), 'organization');
      users(k('userId'), 'organization');
      break;
    case 'OrganizationProfessional':
      orgs(k('organizationId'), 'organization');
      pros(k('professionalId'), 'organization');
      add('all', 'directory');
      break;
    case 'OrganizationInvitation':
      orgs(k('organizationId'), 'organization');
      break;
    case 'OrganizationLocation':
    case 'OrganizationSocialLink':
      orgs(k('organizationId'), 'organization');
      add('all', 'directory');
      break;
    case 'Specialty':
    case 'SubscriptionPlan':
    case 'FinancialInstitution':
    case 'SiteSettings':
      add('all', 'catalog');
      break;
  }
  return out;
}

export interface RealtimeMessage {
  topics: RealtimeTopic[];
  /** Filas que cambiaron, por tema (solo en salas privadas y hasta 20 por tema). */
  refs?: Partial<Record<RealtimeTopic, string[]>>;
}

const MAX_REFS_PER_TOPIC = 20;

/** Junta los avisos de un lote: un solo mensaje por sala, sin temas repetidos. */
export function groupByRoom(deliveries: RealtimeDelivery[]): Map<RealtimeRoom, RealtimeMessage> {
  const rooms = new Map<RealtimeRoom, { topics: Set<RealtimeTopic>; refs: Map<RealtimeTopic, Set<string>> }>();
  for (const { room, topic, ref } of deliveries) {
    const entry = rooms.get(room) ?? { topics: new Set(), refs: new Map() };
    entry.topics.add(topic);
    if (ref) {
      const refs = entry.refs.get(topic) ?? new Set<string>();
      if (refs.size < MAX_REFS_PER_TOPIC) refs.add(ref);
      entry.refs.set(topic, refs);
    }
    rooms.set(room, entry);
  }
  const messages = new Map<RealtimeRoom, RealtimeMessage>();
  for (const [room, { topics, refs }] of rooms) {
    const message: RealtimeMessage = { topics: [...topics] };
    if (refs.size) message.refs = Object.fromEntries([...refs].map(([topic, ids]) => [topic, [...ids]]));
    messages.set(room, message);
  }
  return messages;
}
