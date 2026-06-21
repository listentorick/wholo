'use client';

import { useState, useEffect, useRef } from 'react';
import type { OrganisationSearchResult } from '@wholo/types';
import { adminCustomersApi } from '@wholo/admin-api-client';

interface Props {
  token: string;
  email: string;
  onEmailChange: (email: string) => void;
  selectedOrg: OrganisationSearchResult | null;
  onSelectOrg: (org: OrganisationSearchResult | null) => void;
  onCantFind: () => void;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function formatAddress(org: OrganisationSearchResult): string {
  return [org.addressLine1, org.addressCity, org.addressState]
    .filter(Boolean)
    .join(', ');
}

export function CustomerSearchStep({
  token,
  email,
  onEmailChange,
  selectedOrg,
  onSelectOrg,
  onCantFind,
}: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<OrganisationSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const debouncedQuery = useDebounce(query, 300);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    let cancelled = false;
    setIsSearching(true);
    adminCustomersApi.searchOrganisations(token, debouncedQuery).then((res) => {
      if (!cancelled) {
        setResults(res);
        setOpen(true);
        setIsSearching(false);
      }
    }).catch(() => {
      if (!cancelled) setIsSearching(false);
    });
    return () => { cancelled = true; };
  }, [debouncedQuery, token]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleSelect(org: OrganisationSearchResult) {
    onSelectOrg(org);
    setQuery(org.name);
    setOpen(false);
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    if (selectedOrg) onSelectOrg(null);
  }

  function validateEmail() {
    if (!email) {
      setEmailError('Contact email is required');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('Enter a valid email address');
    } else {
      setEmailError(null);
    }
  }

  return (
    <div>
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-sm font-semibold text-text">Who are you adding?</h2>
      </div>
      <div className="p-5 space-y-4">
        {/* Email */}
        <div>
          <label htmlFor="contact-email" className="block text-xs font-semibold uppercase tracking-wide text-text mb-1.5">
            Contact email
          </label>
          <input
            id="contact-email"
            type="email"
            value={email}
            onChange={(e) => { onEmailChange(e.target.value); setEmailError(null); }}
            onBlur={validateEmail}
            placeholder="orders@example.com"
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-text placeholder-muted/60 outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
          />
          {emailError && <p className="mt-1.5 text-xs text-red-500">{emailError}</p>}
          {!emailError && (
            <p className="mt-1.5 text-xs text-muted">An invitation to connect will be sent to this address.</p>
          )}
        </div>

        {/* Business name autocomplete */}
        <div ref={containerRef} className="relative">
          <label htmlFor="business-search" className="block text-xs font-semibold uppercase tracking-wide text-text mb-1.5">
            Choose a company
          </label>
          <div className="relative">
            <svg viewBox="0 0 20 20" fill="currentColor" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
            </svg>
            <input
              id="business-search"
              type="text"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onFocus={() => { if (results.length > 0 || query.length >= 2) setOpen(true); }}
              placeholder="Search for a business…"
              autoComplete="off"
              className="w-full rounded-md border border-border bg-white pl-9 pr-3 py-2 text-sm text-text placeholder-muted/60 outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
            />
            {isSearching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary" />
            )}
          </div>

          {/* Dropdown */}
          {open && (
            <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-white shadow-lg overflow-hidden">
              {results.length === 0 && !isSearching ? (
                <div className="px-4 py-3 text-sm text-muted">No businesses found.</div>
              ) : (
                results.map((org) => {
                  const isSelected = selectedOrg?.id === org.id;
                  const address = formatAddress(org);
                  if (org.isExistingCustomer) {
                    return (
                      <div
                        key={org.id}
                        className="w-full px-4 py-3 border-b border-border last:border-b-0 cursor-not-allowed opacity-50 select-none"
                      >
                        <span className="flex items-center gap-2">
                          <span className="text-sm font-medium text-text">{org.name}</span>
                          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                            Existing customer
                          </span>
                        </span>
                        {address && <span className="block text-xs text-muted mt-0.5">{address}</span>}
                      </div>
                    );
                  }
                  return (
                    <button
                      key={org.id}
                      type="button"
                      onClick={() => handleSelect(org)}
                      className={`w-full text-left px-4 py-3 border-b border-border last:border-b-0 transition-colors hover:bg-[#fafafa] ${isSelected ? 'border-l-[3px] border-l-primary pl-[13px]' : ''}`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text">{org.name}</span>
                      </span>
                      {address && <span className="block text-xs text-muted mt-0.5">{address}</span>}
                    </button>
                  );
                })
              )}

              {/* Can't find fallback */}
              <div className="border-t border-dashed border-border">
                <button
                  type="button"
                  onClick={onCantFind}
                  className="w-full text-left px-4 py-3 text-sm text-muted hover:text-primary transition-colors flex items-center gap-1.5"
                >
                  I can&apos;t find my business
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-3.5 w-3.5">
                    <path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>

        {selectedOrg && (
          <p className="text-xs text-muted">
            Selected: <span className="font-medium text-text">{selectedOrg.name}</span>
          </p>
        )}
      </div>
    </div>
  );
}
