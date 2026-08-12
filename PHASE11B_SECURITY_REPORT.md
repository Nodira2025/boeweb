# INFORME DE SEGURIDAD Y RLS MULTI-TENANT — FASE 11B

## 1. Protección RLS Blindada en Tablas Comerciales y Financieras

Las nuevas tablas `sales`, `sale_items`, `cash_sessions` y `cash_movements` cuentan con la política estricta de aislamiento RLS:

```sql
CREATE POLICY "RLS sales_isolation" ON public.sales FOR ALL USING (
  public.is_superadmin() OR tenant_id IN (
    SELECT tu.tenant_id FROM public.tenant_users tu 
    WHERE tu.user_id = auth.uid() AND tu.active = true
  )
);
```

---

## 2. Inmunidad del Ledger

- Se removieron explícitamente los permisos `UPDATE` y `DELETE` sobre `public.inventory_ledger`.
- Los eventos son inmutables y append-only para auditoría legal.
