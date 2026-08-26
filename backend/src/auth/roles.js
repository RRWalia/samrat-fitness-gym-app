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

const ROLE_SELECTIONS = Object.freeze({
  OWNER_MANAGER: 'owner_manager',
  FRONT_DESK: 'front_desk',
  TRAINER: 'trainer'
});

const ROLE_SELECTION_OPTIONS = Object.freeze([
  {
    id: ROLE_SELECTIONS.OWNER_MANAGER,
    label: 'Owner / Manager',
    roles: [ROLES.OWNER, ROLES.MANAGER]
  },
  {
    id: ROLE_SELECTIONS.FRONT_DESK,
    label: 'Front Desk',
    roles: [ROLES.FRONT_DESK]
  },
  {
    id: ROLE_SELECTIONS.TRAINER,
    label: 'Trainer',
    roles: [ROLES.TRAINER]
  }
]);

function isFullAccessRole(role) {
  return FULL_ACCESS_ROLES.includes(role);
}

function roleDetails(role) {
  return ROLE_DETAILS[role] || { label: 'Staff', description: '', permissions: [] };
}

function actorTypeForRole(role) {
  return role === ROLES.OWNER ? 'Owner' : 'Staff';
}

function getRoleOption(selectionId) {
  return ROLE_SELECTION_OPTIONS.find(opt => opt.id === selectionId) || null;
}

function getRoleOptionForUserRole(role) {
  return ROLE_SELECTION_OPTIONS.find(opt => opt.roles.includes(role)) || null;
}

function validateRoleSelection(userRole, selectedRole) {
  if (!selectedRole || typeof selectedRole !== 'string') {
    return { valid: true };
  }
  const trimmed = selectedRole.trim();
  if (!trimmed) {
    return { valid: true };
  }
  const selectedOption = getRoleOption(trimmed);
  // Missing or unrecognized role selection is accepted for backward compatibility
  if (!selectedOption) {
    return { valid: true };
  }
  if (selectedOption.roles.includes(userRole)) {
    return { valid: true };
  }
  const actualOption = getRoleOptionForUserRole(userRole);
  const actualLabel = actualOption?.label || roleDetails(userRole).label || 'Staff';
  return {
    valid: false,
    error: `This account is registered as ${actualLabel}, not ${selectedOption.label}. Pick the correct role and try again.`
  };
}

module.exports = {
  ROLES,
  ALL_ROLES,
  FULL_ACCESS_ROLES,
  ROLE_DETAILS,
  ROLE_SELECTIONS,
  ROLE_SELECTION_OPTIONS,
  isFullAccessRole,
  roleDetails,
  actorTypeForRole,
  getRoleOption,
  getRoleOptionForUserRole,
  validateRoleSelection
};
