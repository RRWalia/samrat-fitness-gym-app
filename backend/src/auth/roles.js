const ROLES = Object.freeze({
  OWNER: 'owner',
  MANAGER: 'manager',
  FRONT_DESK: 'front_desk',
  TRAINER: 'trainer'
});

const ALL_ROLES = Object.freeze(Object.values(ROLES));
const FULL_ACCESS_ROLES = Object.freeze([ROLES.OWNER, ROLES.MANAGER]);

const ROLE_DETAILS = Object.freeze({
  [ROLES.OWNER]: {
    label: 'Owner',
    description: 'Full access to financials, members, settings, and staff access.',
    permissions: ['dashboard:read', 'financials:read', 'members:manage', 'settings:manage', 'users:manage', 'attendance:manage', 'pt:manage']
  },
  [ROLES.MANAGER]: {
    label: 'Manager',
    description: 'Full operational access to financials, members, settings, and staff access.',
    permissions: ['dashboard:read', 'financials:read', 'members:manage', 'settings:manage', 'users:manage', 'attendance:manage', 'pt:manage']
  },
  [ROLES.FRONT_DESK]: {
    label: 'Front Desk',
    description: 'Check-in kiosk, recent attendance, and assisted member lookup only.',
    permissions: ['attendance:manage', 'members:lookup']
  },
  [ROLES.TRAINER]: {
    label: 'Trainer',
    description: 'Access only to assigned personal-training clients and PT session usage.',
    permissions: ['pt:assigned:read', 'pt:assigned:update']
  }
});

function isFullAccessRole(role) {
  return FULL_ACCESS_ROLES.includes(role);
}

function roleDetails(role) {
  return ROLE_DETAILS[role] || { label: 'Staff', description: '', permissions: [] };
}

function actorTypeForRole(role) {
  return role === ROLES.OWNER ? 'Owner' : 'Staff';
}

module.exports = {
  ROLES,
  ALL_ROLES,
  FULL_ACCESS_ROLES,
  ROLE_DETAILS,
  isFullAccessRole,
  roleDetails,
  actorTypeForRole
};
