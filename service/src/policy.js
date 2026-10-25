export function evaluatePolicy(config, roleIds) {
  const roles = new Set(roleIds.map(String));
  const allowed = new Set(config.installation.allowedCapabilities ?? []);
  const capabilities = new Set();
  const donorTiers = new Set();
  for (const role of roles) {
    for (const capability of config.policy.roleCapabilities[role] ?? []) {
      if (allowed.has(capability)) capabilities.add(capability);
    }
    const tier = config.policy.roleDonorTiers[role];
    if (tier) donorTiers.add(tier);
  }
  return {
    capabilities: [...capabilities].sort(),
    donorTier: donorTiers.size ? [...donorTiers].sort().at(-1) : null
  };
}
