export type FilterValueKind = 'multi-select' | 'text' | 'date' | 'date-range';

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterOperatorConfig {
  value: string;
  label: string;
}

export interface FilterFieldConfig {
  field: string;
  label: string;
  operators: FilterOperatorConfig[];
  valueKind: FilterValueKind;
  options?: FilterOption[]; // required when valueKind === 'multi-select'
  formatValue?: (raw: string) => string; // chip display formatting; default identity
}

export interface ActiveFilter {
  id: string;
  field: string;
  operator: string;
  value: string | string[];
}
