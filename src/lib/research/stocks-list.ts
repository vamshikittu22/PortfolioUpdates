export interface RegisteredStock {
  ticker: string;
  name: string;
  exchange: string;
  sector: string;
  industry: string;
  marketCapFormatted: string;
}

export const REGISTERED_STOCKS: RegisteredStock[] = [
  { ticker: 'HDFCBANK', name: 'HDFC Bank Ltd', exchange: 'NSE', sector: 'Financial Services', industry: 'Private Sector Bank', marketCapFormatted: '₹13.5 Lakh Cr' },
  { ticker: 'TATASTEEL', name: 'Tata Steel Ltd', exchange: 'NSE', sector: 'Materials', industry: 'Iron & Steel', marketCapFormatted: '₹1.8 Lakh Cr' },
  { ticker: 'YESBANK', name: 'Yes Bank Ltd', exchange: 'NSE', sector: 'Financial Services', industry: 'Private Sector Bank', marketCapFormatted: '₹60,000 Cr' },
  { ticker: 'RELIANCE', name: 'Reliance Industries Ltd', exchange: 'NSE', sector: 'Energy', industry: 'Oil & Gas', marketCapFormatted: '₹20.1 Lakh Cr' },
  { ticker: 'TCS', name: 'Tata Consultancy Services Ltd', exchange: 'NSE', sector: 'Technology', industry: 'IT Services', marketCapFormatted: '₹15.2 Lakh Cr' },
  { ticker: 'INFY', name: 'Infosys Ltd', exchange: 'NSE', sector: 'Technology', industry: 'IT Services', marketCapFormatted: '₹6.5 Lakh Cr' },
  { ticker: 'ZOMATO', name: 'Zomato Ltd', exchange: 'NSE', sector: 'Consumer Services', industry: 'Food Delivery', marketCapFormatted: '₹1.6 Lakh Cr' },
  { ticker: 'PAYTM', name: 'One97 Communications Ltd (Paytm)', exchange: 'NSE', sector: 'Financial Services', industry: 'Fintech', marketCapFormatted: '₹26,000 Cr' },
  { ticker: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', sector: 'Technology', industry: 'Consumer Electronics', marketCapFormatted: '$3.2T' },
  { ticker: 'MSFT', name: 'Microsoft Corporation', exchange: 'NASDAQ', sector: 'Technology', industry: 'Systems Software', marketCapFormatted: '$3.1T' },
  { ticker: 'GOOGL', name: 'Alphabet Inc. (Google)', exchange: 'NASDAQ', sector: 'Technology', industry: 'Internet Services', marketCapFormatted: '$2.2T' },
  { ticker: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ', sector: 'Technology', industry: 'Semiconductors', marketCapFormatted: '$3.0T' },
  { ticker: 'TSLA', name: 'Tesla Inc.', exchange: 'NASDAQ', sector: 'Consumer Discretionary', industry: 'Automotive', marketCapFormatted: '$580B' },
  { ticker: 'AMZN', name: 'Amazon.com Inc.', exchange: 'NASDAQ', sector: 'Consumer Services', industry: 'E-Commerce', marketCapFormatted: '$1.8T' },
  { ticker: 'NFLX', name: 'Netflix Inc.', exchange: 'NASDAQ', sector: 'Consumer Services', industry: 'Broadcasting & Entertainment', marketCapFormatted: '$280B' },
  { ticker: 'PARAS', name: 'Paras Defence and Space Technologies Ltd', exchange: 'NSE', sector: 'Industrials', industry: 'Aerospace & Defense', marketCapFormatted: '₹4,500 Cr' },
];
