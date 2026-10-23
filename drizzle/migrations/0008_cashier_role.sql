-- Caixa: acesso limitado, sem leitura direta do estado financeiro.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'cashier';