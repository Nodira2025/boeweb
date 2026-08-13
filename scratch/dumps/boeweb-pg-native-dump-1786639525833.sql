-- PostgreSQL database dump (native format export)
-- Dumped from database version 15.1
-- Dumped by pg_dump / Supabase CLI v2.114.0

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', 'public, pg_temp', false);

-- Data for Name: tenants; Type: TABLE DATA; Schema: public; Owner: postgres
INSERT INTO public.tenants VALUES ('{"id":"11111111-1111-1111-1111-111111111111","name":"BÔ Grow Club"}');

-- Data for Name: tenant_users; Type: TABLE DATA; Schema: public; Owner: postgres
INSERT INTO public.tenant_users VALUES ('{"user_id":"usr-1","role":"ADMIN"}');

-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: postgres
INSERT INTO public.products VALUES ('{"id":"P01","name":"Sustrato 80L","price":12000}');

-- Data for Name: suppliers; Type: TABLE DATA; Schema: public; Owner: postgres
INSERT INTO public.suppliers VALUES ('{"id":"SUP-1","name":"Grower Wholesale"}');

-- Data for Name: supplier_products; Type: TABLE DATA; Schema: public; Owner: postgres
INSERT INTO public.supplier_products VALUES ('{"id":"SP-1","product_id":"P01","price":10000}');

-- Data for Name: sales; Type: TABLE DATA; Schema: public; Owner: postgres
INSERT INTO public.sales VALUES ('{"id":"S01","total":12000}');

-- Data for Name: sale_items; Type: TABLE DATA; Schema: public; Owner: postgres
INSERT INTO public.sale_items VALUES ('{"id":"SI01","sale_id":"S01","product_id":"P01","quantity":1}');

-- Data for Name: cash_sessions; Type: TABLE DATA; Schema: public; Owner: postgres
INSERT INTO public.cash_sessions VALUES ('{"id":"CS01","status":"OPEN"}');

-- Data for Name: cash_movements; Type: TABLE DATA; Schema: public; Owner: postgres
INSERT INTO public.cash_movements VALUES ('{"id":"CM01","amount":12000}');

-- Data for Name: inventory_balances; Type: TABLE DATA; Schema: public; Owner: postgres
INSERT INTO public.inventory_balances VALUES ('{"product_id":"P01","on_hand_sellable":10}');

-- Data for Name: inventory_locations; Type: TABLE DATA; Schema: public; Owner: postgres
INSERT INTO public.inventory_locations VALUES ('{"product_id":"P01","quantity":10}');

-- Data for Name: inventory_reservations; Type: TABLE DATA; Schema: public; Owner: postgres
INSERT INTO public.inventory_reservations VALUES ('{"id":"RES01","quantity":2}');

-- Data for Name: inventory_ledger; Type: TABLE DATA; Schema: public; Owner: postgres
INSERT INTO public.inventory_ledger VALUES ('{"id":"LED01","quantity":1}');

-- Data for Name: admin_activity_log; Type: TABLE DATA; Schema: public; Owner: postgres
INSERT INTO public.admin_activity_log VALUES ('{"id":"LOG01","action":"SALE"}');

-- Data for Name: operational_alerts; Type: TABLE DATA; Schema: public; Owner: postgres
INSERT INTO public.operational_alerts VALUES ('{"id":"ALT01","alert_type":"LOW_STOCK"}');

-- Data for Name: alert_rules; Type: TABLE DATA; Schema: public; Owner: postgres
INSERT INTO public.alert_rules VALUES ('{"id":"RUL01","min_stock":5}');

-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: public; Owner: postgres
INSERT INTO public.schema_migrations VALUES ('{"version":"001","checksum":"hash1"}');
