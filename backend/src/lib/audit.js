import { prisma } from './prisma.js';

export async function writeAudit(req, { module, action, recordId = null, oldValues = null, newValues = null }) {
  try {
    let userId = req.user?.id || null;
    if (!userId && req.user?.devBypass) {
      const admin = await prisma.user.findFirst({ where:{ isActive:true, role:{ roleCode:'ADMIN' } }, select:{ id:true } });
      userId = admin?.id || null;
    }
    await prisma.auditLog.create({ data: {
      userId,
      module,
      action,
      recordId,
      oldValues,
      newValues,
    }});
  } catch (error) {
    console.error('Audit write failed:', error.message);
  }
}
