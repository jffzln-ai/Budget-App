import React from 'react';
import { IconWallet, IconBank, IconPiggyBank, IconCreditCard, IconChevronRight } from './icons.jsx';
import { useCountUp } from './useCountUp.js';

// Shared account presentation, so every page labels and colours accounts the same way.

export const DEBT_TYPES = ['credit_card', 'line_of_credit'];

export const ACCOUNT_KIND = {
  chequing: 'Chequing', savings: 'Savings', credit_card: 'Credit card', line_of_credit: 'Line of credit', investment: 'Investments',
};

export function isDebtAccount(account) {
  return DEBT_TYPES.includes(account.type);
}

export function accountIcon(type) {
  switch (type) {
    case 'savings': return IconPiggyBank;
    case 'credit_card':
    case 'line_of_credit': return IconCreditCard;
    case 'investment': return IconWallet;
    default: return IconBank;
  }
}

export function fmtCAD(n) {
  if (n === null || n === undefined) return '—';
  const sign = n < 0 ? '−' : '';
  return sign + '$' + Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// A dollar figure that counts to its new value when it changes.
export function Money({ value, className, style }) {
  const shown = useCountUp(value);
  return <span className={className} style={style}>{fmtCAD(shown)}</span>;
}

// Debt shows as an amount owed in ink, not red: carrying a card balance is
// normal. Red is reserved for something wrong, like an overdrawn chequing account.
// For debt, `value` uses the app-wide sign: negative = owed, positive = a credit.
export function DebtAwareAmount({ value, isDebt, className = 't-14 semi' }) {
  const overdrawn = !isDebt && (value || 0) < 0;
  const debtLabel = (value || 0) > 0 ? 'credit' : 'owed';
  return (
    <span className="row-end">
      <Money value={isDebt ? Math.abs(value || 0) : (value || 0)} className={`row-amount ${className}`} style={overdrawn ? { color: 'var(--neg)' } : undefined} />
      {isDebt && <span className="row-sub t-12 muted">{debtLabel}</span>}
    </span>
  );
}

export function AccountRow({ account, balance, onSelect, trailing }) {
  const Icon = accountIcon(account.type);
  const Tag = onSelect ? 'button' : 'div';
  return (
    <li style={trailing ? { display: 'flex', alignItems: 'center', flexWrap: 'wrap' } : undefined}>
      <Tag
        type={onSelect ? 'button' : undefined}
        className="row"
        style={trailing ? { flex: 1, width: 'auto', minWidth: 0, cursor: onSelect ? 'pointer' : 'default' } : undefined}
        onClick={onSelect ? () => onSelect(account.id) : undefined}
        aria-label={onSelect ? `View ${account.name} transactions` : undefined}
      >
        <span className="row-icon"><Icon /></span>
        <span className="row-main">
          <span className="row-title t-14 semi">{account.name}</span>
          <span className="row-sub t-12 muted">{ACCOUNT_KIND[account.type] || 'Account'}</span>
        </span>
        <DebtAwareAmount value={balance} isDebt={isDebtAccount(account)} />
        {onSelect && <span className="row-chev"><IconChevronRight /></span>}
      </Tag>
      {trailing}
    </li>
  );
}
