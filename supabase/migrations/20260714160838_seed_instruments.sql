-- Phase 2: seed instrument master data covering NSE, BSE, and US exchanges,
-- including the roadmap-mandated dual-listing example (INFY on NSE vs NYSE as
-- two distinct instrument rows with different ISIN/currency/price_source_symbol).
-- ON CONFLICT (isin, exchange) DO NOTHING makes this migration idempotent.

INSERT INTO public.instruments (isin, symbol, exchange, display_name, asset_type, currency, price_source_symbol) VALUES
  ('INE002A01018', 'RELIANCE',   'NSE',    'Reliance Industries',        'stocks', 'INR', 'RELIANCE.NS'),
  ('INE467B01029', 'TCS',        'NSE',    'Tata Consultancy Services',  'stocks', 'INR', 'TCS.NS'),
  ('INE009A01021', 'INFY',       'NSE',    'Infosys Ltd.',               'stocks', 'INR', 'INFY.NS'),
  ('INE040A01034', 'HDFCBANK',   'NSE',    'HDFC Bank',                  'stocks', 'INR', 'HDFCBANK.NS'),
  ('INE090A01021', 'ICICIBANK',  'NSE',    'ICICI Bank',                 'stocks', 'INR', 'ICICIBANK.NS'),
  ('INE154A01025', 'ITC',        'NSE',    'ITC Ltd.',                   'stocks', 'INR', 'ITC.NS'),
  ('INE155A01022', 'TATAMOTORS', 'NSE',    'Tata Motors',                'stocks', 'INR', 'TATAMOTORS.NS'),
  ('INE758T01015', 'ZOMATO',     'NSE',    'Zomato Ltd.',                'stocks', 'INR', 'ZOMATO.NS'),
  ('INE982J01020', 'PAYTM',      'NSE',    'One97 Communications',       'stocks', 'INR', 'PAYTM.NS'),
  ('INE030A01027', 'HUL',        'NSE',    'Hindustan Unilever',         'stocks', 'INR', 'HUL.NS'),
  ('INE081A01012', 'TATASTEEL',  'BSE',    'Tata Steel Ltd.',            'stocks', 'INR', 'TATASTEEL.BO'),
  ('US0378331005', 'AAPL',       'NASDAQ', 'Apple Inc.',                 'stocks', 'USD', 'AAPL'),
  ('US5949181045', 'MSFT',       'NASDAQ', 'Microsoft Corp.',            'stocks', 'USD', 'MSFT'),
  ('US67066G1040', 'NVDA',       'NASDAQ', 'NVIDIA Corp.',               'stocks', 'USD', 'NVDA'),
  ('US88160R1014', 'TSLA',       'NASDAQ', 'Tesla Inc.',                 'stocks', 'USD', 'TSLA'),
  -- Dual-listing proof (roadmap-mandated example): same company, two distinct
  -- instrument rows — Infosys ADR trades on NYSE under a different ISIN/currency.
  ('US4567881085', 'INFY',       'NYSE',   'Infosys Ltd. (ADR)',         'stocks', 'USD', 'INFY')
ON CONFLICT (isin, exchange) DO NOTHING;
