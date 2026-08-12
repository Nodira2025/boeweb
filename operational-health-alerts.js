/* ==========================================================================
   BÔ GROW CLUB / PLATAFORMA SAAS — CENTRO DE SALUD OPERATIVO Y ALERTAS (FASE 13)
   ==========================================================================
   Motor de salud, alertas deduplicadas y notificaciones in-app.
   Regla de Oro: Una alerta NUNCA modifica la contabilidad ni el inventario.
   ========================================================================== */

const OPERATIONAL_ALERTS_STORE = [];
const OPERATIONAL_ALERT_EVENTS_STORE = [];
const ALERT_NOTIFICATIONS_STORE = [];
const HEALTH_CHECK_RUNS_STORE = [];

class OperationalHealthAlertsEngine {
  constructor() {
    this.alerts = OPERATIONAL_ALERTS_STORE;
    this.events = OPERATIONAL_ALERT_EVENTS_STORE;
    this.notifications = ALERT_NOTIFICATIONS_STORE;
    this.runs = HEALTH_CHECK_RUNS_STORE;
  }

  // 1. Ejecutar Salud del Tenant con Deduplicación y Auto-Resolución
  runTenantHealthChecks(tenantId, stores = {}) {
    const startedAt = new Date().toISOString();
    const errors = [];
    let checksExecuted = 0;
    let openedCount = 0;
    let updatedCount = 0;
    let resolvedCount = 0;

    try {
      const activeConditions = [];

      // A. Inventario: Low Stock & Out of Stock
      const balances = stores.balancesStore || [];
      for (const b of balances.filter(item => item.tenant_id === tenantId)) {
        checksExecuted++;
        const onHand = Number(b.on_hand_sellable || 0);
        if (onHand === 0) {
          activeConditions.push({
            type: 'OUT_OF_STOCK',
            category: 'INVENTORY',
            severity: 'CRITICAL',
            title: `Producto agotado: ${b.product_id}`,
            message: `El producto ${b.product_id} no cuenta con unidades vendibles disponibles.`,
            source_entity_type: 'PRODUCT',
            source_entity_id: b.product_id,
            fingerprint: `OUT_OF_STOCK:${tenantId}:${b.product_id}`,
            context: { on_hand: 0 }
          });
        } else if (onHand < (b.min_stock || 5)) {
          activeConditions.push({
            type: 'LOW_STOCK',
            category: 'INVENTORY',
            severity: 'WARNING',
            title: `Stock crítico: ${b.product_id}`,
            message: `El producto ${b.product_id} posee ${onHand} u., por debajo del umbral (${b.min_stock || 5} u.).`,
            source_entity_type: 'PRODUCT',
            source_entity_id: b.product_id,
            fingerprint: `LOW_STOCK:${tenantId}:${b.product_id}`,
            context: { on_hand: onHand, min_stock: b.min_stock || 5 }
          });
        }
      }

      // B. Caja: Sesión Abierta Prolongada & Diferencia de Cierre
      const sessions = stores.cashSessionsStore || [];
      const movements = stores.cashMovementsStore || [];
      for (const s of sessions.filter(sess => sess.tenant_id === tenantId)) {
        checksExecuted++;
        if (s.status === 'OPEN') {
          const hoursOpen = (new Date() - new Date(s.opened_at)) / (1000 * 60 * 60);
          if (hoursOpen > 14) {
            activeConditions.push({
              type: 'CASH_SESSION_OPEN_TOO_LONG',
              category: 'CASH',
              severity: 'WARNING',
              title: `Caja abierta hace más de 14 horas`,
              message: `La caja registradora ${s.register_id} abierta por ${s.opened_by} continúa abierta.`,
              source_entity_type: 'CASH_SESSION',
              source_entity_id: s.id,
              fingerprint: `CASH_OPEN:${tenantId}:${s.id}`,
              context: { hours_open: Math.round(hoursOpen) }
            });
          }
        } else if (s.status === 'CLOSED' && s.closing_counted !== null && s.closing_counted !== undefined) {
          let summary = { expected_cash: Number(s.opening_amount || 0) };
          if (typeof PosInventorySync !== 'undefined') {
            summary = PosInventorySync.getCashSessionSummary(s.id, tenantId, sessions, movements);
          }
          const diff = Math.abs(Number(s.closing_counted) - summary.expected_cash);
          if (diff > 0.01) {
            activeConditions.push({
              type: 'CASH_DIFFERENCE',
              category: 'CASH',
              severity: 'CRITICAL',
              title: `Diferencia en arqueo de caja`,
              message: `Diferencia detectada de $${diff.toFixed(2)} (Contado: $${s.closing_counted}, Esperado: $${summary.expected_cash}).`,
              source_entity_type: 'CASH_SESSION',
              source_entity_id: s.id,
              fingerprint: `CASH_DIFF:${tenantId}:${s.id}`,
              context: { difference: diff, counted: s.closing_counted, expected: summary.expected_cash }
            });
          }
        }
      }

      // C. Reservas: Expiradas
      const reservations = stores.reservationsStore || [];
      const nowIso = new Date().toISOString();
      for (const r of reservations.filter(res => res.tenant_id === tenantId)) {
        checksExecuted++;
        if (r.status === 'ACTIVE' && r.expires_at < nowIso) {
          activeConditions.push({
            type: 'ACTIVE_RESERVATION_EXPIRED',
            category: 'RESERVATIONS',
            severity: 'WARNING',
            title: `Reserva comercial vencida`,
            message: `La reserva ${r.id} para el producto ${r.product_id} venció el ${r.expires_at}.`,
            source_entity_type: 'RESERVATION',
            source_entity_id: r.id,
            fingerprint: `RES_EXPIRED:${tenantId}:${r.id}`,
            context: { expires_at: r.expires_at }
          });
        }
      }

      // D. Auditorías WMS Pendientes
      const audits = stores.auditsStore || [];
      for (const a of audits.filter(aud => aud.tenant_id === tenantId)) {
        checksExecuted++;
        if (a.status === 'PENDING') {
          activeConditions.push({
            type: 'AUDIT_PENDING_TOO_LONG',
            category: 'WMS_AUDIT',
            severity: 'WARNING',
            title: `Auditoría WMS pendiente`,
            message: `Auditoría pendiente en módulo ${a.module_code} para SKU ${a.product_id}.`,
            source_entity_type: 'WMS_AUDIT',
            source_entity_id: a.id,
            fingerprint: `AUDIT_PENDING:${tenantId}:${a.id}`,
            context: { module: a.module_code, diff: a.difference }
          });
        }
      }

      // E. Migraciones Fallidas
      const migrations = stores.migrationsStore || [];
      for (const m of migrations.filter(mig => mig.tenant_id === tenantId)) {
        checksExecuted++;
        if (m.status === 'FAILED') {
          activeConditions.push({
            type: 'MIGRATION_FAILED',
            category: 'MIGRATION',
            severity: 'CRITICAL',
            title: `Migración de catálogo fallida`,
            message: `El proceso de migración ${m.id} falló durante el procesamiento.`,
            source_entity_type: 'MIGRATION',
            source_entity_id: m.id,
            fingerprint: `MIG_FAILED:${tenantId}:${m.id}`,
            context: { error: m.error_message }
          });
        }
      }

      // 2. Procesar Deduplicación / Actualización de Ocurrencias
      const activeFingerprints = new Set(activeConditions.map(c => c.fingerprint));

      for (const cond of activeConditions) {
        let existingAlert = this.alerts.find(a => a.tenant_id === tenantId && a.fingerprint === cond.fingerprint && a.status !== 'RESOLVED');

        if (existingAlert) {
          existingAlert.occurrence_count += 1;
          existingAlert.last_detected_at = startedAt;
          existingAlert.context = cond.context;
          updatedCount++;

          this.events.push({
            id: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            alert_id: existingAlert.id,
            tenant_id: tenantId,
            event_type: 'DETECTED_AGAIN',
            created_at: startedAt
          });
        } else {
          const newAlert = {
            id: `alt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            tenant_id: tenantId,
            alert_type: cond.type,
            category: cond.category,
            severity: cond.severity,
            status: 'OPEN',
            title: cond.title,
            message: cond.message,
            source_entity_type: cond.source_entity_type,
            source_entity_id: cond.source_entity_id,
            fingerprint: cond.fingerprint,
            context: cond.context,
            first_detected_at: startedAt,
            last_detected_at: startedAt,
            occurrence_count: 1,
            created_at: startedAt
          };
          this.alerts.push(newAlert);
          openedCount++;

          this.events.push({
            id: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            alert_id: newAlert.id,
            tenant_id: tenantId,
            event_type: 'CREATED',
            created_at: startedAt
          });

          // Notificación In-App
          this.notifications.push({
            id: `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            tenant_id: tenantId,
            alert_id: newAlert.id,
            title: cond.title,
            severity: cond.severity,
            read: false,
            created_at: startedAt
          });
        }
      }

      // 3. Auto-Resolución cuando la condición desaparece naturalmente
      const openAlerts = this.alerts.filter(a => a.tenant_id === tenantId && a.status === 'OPEN');
      for (const alert of openAlerts) {
        if (!activeFingerprints.has(alert.fingerprint)) {
          alert.status = 'RESOLVED';
          alert.resolved_at = startedAt;
          alert.resolution_type = 'AUTO_CONDITION_CLEARED';
          resolvedCount++;

          this.events.push({
            id: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            alert_id: alert.id,
            tenant_id: tenantId,
            event_type: 'AUTO_RESOLVED',
            created_at: startedAt
          });
        }
      }

      // 4. Calcular Estado de Salud del Tenant (HEALTHY / ATTENTION / CRITICAL)
      const currentTenantAlerts = this.alerts.filter(a => a.tenant_id === tenantId && a.status === 'OPEN');
      const hasCritical = currentTenantAlerts.some(a => a.severity === 'CRITICAL');
      const hasWarning = currentTenantAlerts.some(a => a.severity === 'WARNING');

      const healthStatus = hasCritical ? 'CRITICAL' : (hasWarning ? 'ATTENTION' : 'HEALTHY');

      const runRecord = {
        id: `run-${Date.now()}`,
        tenant_id: tenantId,
        status: healthStatus,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        checks_executed: checksExecuted,
        alerts_opened: openedCount,
        alerts_updated: updatedCount,
        alerts_resolved: resolvedCount,
        errors: []
      };
      this.runs.push(runRecord);

      return {
        tenant_id: tenantId,
        status: healthStatus,
        open_alerts: currentTenantAlerts.length,
        critical_count: currentTenantAlerts.filter(a => a.severity === 'CRITICAL').length,
        warning_count: currentTenantAlerts.filter(a => a.severity === 'WARNING').length,
        info_count: currentTenantAlerts.filter(a => a.severity === 'INFO').length,
        run_summary: runRecord
      };
    } catch (err) {
      errors.push(err.message);
      const failedRun = {
        id: `run-${Date.now()}`,
        tenant_id: tenantId,
        status: 'CHECK_FAILED',
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        checks_executed: checksExecuted,
        errors: errors
      };
      this.runs.push(failedRun);

      return {
        tenant_id: tenantId,
        status: 'CHECK_FAILED',
        error: err.message,
        open_alerts: 0
      };
    }
  }

  // Acciones Manuales sobre Alertas (Acknowledge, Assign, Snooze, Resolve)
  acknowledgeAlert(alertId, tenantId, userId) {
    const alert = this.alerts.find(a => a.id === alertId && a.tenant_id === tenantId);
    if (!alert) throw new Error('Alerta no encontrada');
    alert.status = 'ACKNOWLEDGED';
    alert.acknowledged_by = userId;
    alert.acknowledged_at = new Date().toISOString();

    this.events.push({
      id: `evt-${Date.now()}`,
      alert_id: alert.id,
      tenant_id: tenantId,
      event_type: 'ACKNOWLEDGED',
      actor_user_id: userId,
      created_at: new Date().toISOString()
    });

    if (typeof AdminOperationsConsole !== 'undefined') {
      AdminOperationsConsole.logAdminActivity({
        actor_id: userId,
        actor_name: 'Usuario Autenticado',
        tenant_id: tenantId,
        action: 'ALERT_ACKNOWLEDGE',
        entity_type: 'OPERATIONAL_ALERT',
        entity_id: alertId
      });
    }

    return alert;
  }

  assignAlert(alertId, tenantId, assignUserId, actorUserId) {
    const alert = this.alerts.find(a => a.id === alertId && a.tenant_id === tenantId);
    if (!alert) throw new Error('Alerta no encontrada');
    alert.assigned_user_id = assignUserId;

    this.events.push({
      id: `evt-${Date.now()}`,
      alert_id: alert.id,
      tenant_id: tenantId,
      event_type: 'ASSIGNED',
      actor_user_id: actorUserId,
      metadata: { assigned_to: assignUserId },
      created_at: new Date().toISOString()
    });

    return alert;
  }

  resolveAlertManually(alertId, tenantId, userId, resolutionNote = 'Resuelto manualmente por administrador') {
    const alert = this.alerts.find(a => a.id === alertId && a.tenant_id === tenantId);
    if (!alert) throw new Error('Alerta no encontrada');
    alert.status = 'RESOLVED';
    alert.resolved_by = userId;
    alert.resolved_at = new Date().toISOString();
    alert.resolution_type = 'MANUALLY_RESOLVED';

    this.events.push({
      id: `evt-${Date.now()}`,
      alert_id: alert.id,
      tenant_id: tenantId,
      event_type: 'MANUALLY_RESOLVED',
      actor_user_id: userId,
      metadata: { note: resolutionNote },
      created_at: new Date().toISOString()
    });

    if (typeof AdminOperationsConsole !== 'undefined') {
      AdminOperationsConsole.logAdminActivity({
        actor_id: userId,
        actor_name: 'Usuario Autenticado',
        tenant_id: tenantId,
        action: 'ALERT_MANUAL_RESOLVE',
        entity_type: 'OPERATIONAL_ALERT',
        entity_id: alertId,
        metadata: { note: resolutionNote }
      });
    }

    return alert;
  }

  // Notificaciones In-App
  getUnreadNotifications(tenantId) {
    return this.notifications.filter(n => n.tenant_id === tenantId && !n.read);
  }

  markNotificationAsRead(notifId, tenantId) {
    const notif = this.notifications.find(n => n.id === notifId && n.tenant_id === tenantId);
    if (notif) notif.read = true;
    return notif;
  }
}

const OperationalHealthAlerts = new OperationalHealthAlertsEngine();

if (typeof window !== 'undefined') {
  window.OperationalHealthAlerts = OperationalHealthAlerts;
  window.OPERATIONAL_ALERTS_STORE = OPERATIONAL_ALERTS_STORE;
  window.OPERATIONAL_ALERT_EVENTS_STORE = OPERATIONAL_ALERT_EVENTS_STORE;
  window.ALERT_NOTIFICATIONS_STORE = ALERT_NOTIFICATIONS_STORE;
}
if (typeof global !== 'undefined') {
  global.OperationalHealthAlerts = OperationalHealthAlerts;
  global.OPERATIONAL_ALERTS_STORE = OPERATIONAL_ALERTS_STORE;
  global.OPERATIONAL_ALERT_EVENTS_STORE = OPERATIONAL_ALERT_EVENTS_STORE;
  global.ALERT_NOTIFICATIONS_STORE = ALERT_NOTIFICATIONS_STORE;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    OperationalHealthAlerts,
    OPERATIONAL_ALERTS_STORE,
    OPERATIONAL_ALERT_EVENTS_STORE,
    ALERT_NOTIFICATIONS_STORE
  };
}
