const CATEGORY_RULES = [
  [/ONTA\s*PAY/i, 'Payroll', null],
  [/WAWANESA/i, 'Insurance', null],
  [/NETFLIX|YOUTUBEPREMIUM|AMAZON CHANNELS|SIRIUSXM|MICROSOFT\*XBOX|ANTHROPIC|CLAUDE\.AI|NEW YORK TIMES|PRIMEVIDEO/i, 'Subscriptions', null],
  [/TBAYTEL|SHAW CABLESYSTEMS|SYNERGY|ENBRIDGE/i, 'Utilities', null],
  [/CTB SOLID WASTE/i, 'Utilities', null],
  [/CITY OF THUNDER.*TAX/i, 'Property Tax', null],
  [/CITY OF THUNDER.*BPY/i, 'Utilities', null],
  [/I\s?&?M ELECTRIC/i, 'Work Expense', 'reimbursable_work'],
  [/REAL CDN SUPERSTORE|SHOPPERS DRUG M/i, 'Groceries & Pharmacy', null],
  [/LCBO|BEER STORE/i, 'Alcohol', null],
  [/PIZZA HUT|SKIPTHEDISHES|CARIBOU RESTAURANT|SECOND CUP|CASTLE|BOGDALAS SMOKED/i, 'Dining', null],
  [/HUSKY|ESSO|GAS BAR/i, 'Auto - Fuel', null],
  [/FORD CREDIT/i, 'Auto - Loan', null],
  [/FAT GUYS AUTO|ALLEN'S AUTO/i, 'Auto - Repair', null],
  [/HOME DEPOT|CANADIAN TIRE|STAPLES/i, 'Home & Retail', null],
  [/MOTEL|BOOKING HOTEL/i, 'Travel', null],
  [/THUNDER BAY REGIONAL HEAL/i, 'Health', null],
  [/MONTHLY ACCOUNT FEE|OVERDRAFT INTEREST|O\.D\.P\. FEE/i, 'Bank Fees', null],
  [/QUESTRADE/i, 'Investment Contribution', null],
  [/REWARDS REDEMPTION|REDEEM - PURCHASES/i, 'Rewards & Rebates', null],
  [/BEST BUY MARKET PLACE/i, 'Refund', null],
  [/BEST BUY #/i, 'Electronics', null],
  [/RAKUTENKOBO/i, 'Entertainment & Media', null],
  [/AMZN Mktp/i, 'Shopping', null],
  [/SP 47 BRAND/i, 'Clothing', null],
  [/CITY OF TBAY - RECREATION/i, 'Recreation', null],
  [/FAMOUS PLAYER/i, 'Entertainment & Media', null],
  [/TD ATM DEP/i, 'Cash Deposit', null],
  // Added Oct 2026: merchants that were landing in Uncategorized
  [/PETRO-CANADA|MOBIL@/i, 'Auto - Fuel', null],
  [/REAL CDN SUPERS|REXALL/i, 'Groceries & Pharmacy', null],
  [/DOMINO'?S|THAI KITCHEN|^TST-|AMSTERDAM BREWHOUSE|BEERTOWN|CAFE LANDWER|THE COMMISSARY/i, 'Dining', null],
  [/CINEPLEX|KOBO EBOOKS/i, 'Entertainment & Media', null],
  [/SUPABASE|TWILIO/i, 'Subscriptions', null],
  [/HOMEDEPOT|DOLLARAMA/i, 'Home & Retail', null],
  [/MC CARTNEY DENT|THUNDER BAY REG\b/i, 'Health', null],
  [/WITHDRAWAL FEES/i, 'Bank Fees', null],
  [/RELIANCEHOMECOMFORT/i, 'Utilities', null],
  [/WESTIN HOTEL/i, 'Travel', null],
  [/^AMAZON$/i, 'Shopping', null],
  // Added Oct 2026 (batch 2): reviewed one by one
  [/^NEO FINANCIAL MSP/i, 'Emergency Fund', null],
  [/TBJ CONCESSIONS|^NOMAD\b|^USAT_WT/i, 'Dining', null],
  [/^EDGE BENEFITS MSP/i, 'Insurance', null],
  [/^BEST BUY$/i, 'Electronics', null],
  [/^INTEREST CREDIT$/i, 'Interest Income', null],
  [/^FRESH AIR$/i, 'Shopping', null],
  [/^MNP LLP|^PUROLATOR/i, 'Work Expense', null],
  [/TD ATM W\/D/i, 'Cash Withdrawal', null],
  [/^JAYS SHOP/i, 'Entertainment & Media', null],
  [/^THUNDER BAY INTERNATIONAL|^CITY ISLAND MARKET/i, 'Travel', null],
  [/^FIRST CHOICE HA/i, 'Personal Care', null],
  [/^INTERCITY INDUS|^MEMORIAL HOME H/i, 'Home & Retail', null],
  [/^WIKIPEDIA|WIKIMED/i, 'Donations', null],
  [/^SASI WATER/i, 'Groceries & Pharmacy', null],
  [/^SEND E-TFR|^E-TRANSFER/i, 'Uncategorized', 'uncategorized_transfer'],
];

const TRANSFER_PATTERNS = [/TFR-(TO|FR)/i, /^PAYMENT - THANK YOU$/i, /^PTS (TO|FRM):/i];
function isTransferCandidate(desc) { return TRANSFER_PATTERNS.some(p => p.test(desc)); }

const TRANSFER_DEST_RULES = [
  [/C\/C/, 'Transfer - Card Payment'],
  [/0151246/, 'Transfer - Savings'],
  [/6682115/, 'Transfer - BS Savings'],
  [/6696582/, 'Transfer - New Atlantic (Rental)'],
  [/28F520J/i, 'Transfer - TFSA'],
  [/3294431/, 'Transfer - Line of Credit'],
];
const OWN_ACCOUNT_LABEL = { savings: 'Transfer - Savings', bs_savings: 'Transfer - BS Savings', new_atlantic: 'Transfer - New Atlantic (Rental)' };

function transferSubcategory(desc, accountType, accountSlug) {
  if (accountType === 'credit_card') return 'Transfer - Card Payment';
  if (accountType === 'line_of_credit') return 'Transfer - Line of Credit';
  if (OWN_ACCOUNT_LABEL[accountSlug]) return OWN_ACCOUNT_LABEL[accountSlug];
  for (const [pattern, label] of TRANSFER_DEST_RULES) if (pattern.test(desc)) return label;
  return 'Transfer - Other';
}

// account: { type, name } - name is used only to detect which savings sub-account this is
export function categorizeRaw(raw_description, amount, account) {
  if (isTransferCandidate(raw_description)) {
    const slug = account.name === 'Savings' ? 'savings' : account.name === 'BS Savings' ? 'bs_savings' : account.name === 'New Atlantic' ? 'new_atlantic' : null;
    return { is_transfer: true, needs_review: true, category: transferSubcategory(raw_description, account.type, slug), tags: [] };
  }
  // Inbound household transfer: the other leg isn't in any tracked account, so it
  // can't be matched - flag as transfer (excluded from spending) but don't queue for review.
  if (/^ROYAL BANK OF CANADA$/i.test(raw_description)) {
    return { is_transfer: true, needs_review: false, category: 'Transfers from Jenn', tags: [] };
  }
  for (const [pattern, cat, tag] of CATEGORY_RULES) {
    if (pattern.test(raw_description)) {
      let category = cat;
      if (category === 'Insurance') {
        const amt = Math.abs(amount);
        if (Math.abs(amt - 231.47) < 1) category = 'Insurance - Auto';
        else if (Math.abs(amt - 328.01) < 1) category = 'Insurance - Home & Rental';
      }
      return { is_transfer: false, needs_review: false, category, tags: tag ? [tag] : [] };
    }
  }
  return { is_transfer: false, needs_review: false, category: 'Uncategorized', tags: [] };
}
