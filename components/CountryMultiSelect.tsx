'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown, ChevronUp, Globe, Plus, X } from 'lucide-react';

export const STANDARD_COUNTRIES: string[] = [
  'Remote (Global)',
  'Egypt',
  'United Arab Emirates',
  'Saudi Arabia',
  'Germany',
  'United Kingdom',
  'Netherlands',
  'United States',
  'Canada',
  'Qatar',
  'Kuwait',
  'Bahrain',
  'Oman',
  'Jordan',
  'France',
  'Spain',
  'Switzerland',
  'Ireland',
  'Sweden',
  'Singapore'
];

interface CountryMultiSelectProps {
  selected: string[];
  onChange: (countries: string[]) => void;
  placeholder?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

export default function CountryMultiSelect({
  selected,
  onChange,
  placeholder = 'Select target countries...',
  label,
  required = false,
  disabled = false,
  className = '',
}: CountryMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleCountry = (country: string) => {
    if (disabled) return;
    if (selected.includes(country)) {
      onChange(selected.filter((c) => c !== country));
    } else {
      onChange([...selected, country]);
    }
  };

  const removeCountry = (e: React.MouseEvent, country: string) => {
    e.stopPropagation();
    if (disabled) return;
    onChange(selected.filter((c) => c !== country));
  };

  const handleAddCustom = () => {
    const trimmed = search.trim();
    if (trimmed && !selected.includes(trimmed)) {
      onChange([...selected, trimmed]);
      setSearch('');
    }
  };

  const filteredCountries = STANDARD_COUNTRIES.filter((c) =>
    c.toLowerCase().includes(search.toLowerCase())
  );

  const canAddCustom =
    search.trim().length > 0 &&
    !STANDARD_COUNTRIES.some((c) => c.toLowerCase() === search.trim().toLowerCase()) &&
    !selected.some((c) => c.toLowerCase() === search.trim().toLowerCase());

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label className="block text-xs font-bold text-slate-200 mb-1">
          {label} {required && <span className="text-rose-400">* (Explicitly Required)</span>}
        </label>
      )}

      {/* Trigger & Selected Badges Container */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full bg-slate-950 border rounded-lg p-2 min-h-[42px] cursor-pointer transition-colors flex items-center justify-between gap-2 ${
          isOpen
            ? 'border-emerald-500 ring-1 ring-emerald-500/30'
            : selected.length === 0 && required
            ? 'border-emerald-500/50 hover:border-emerald-400'
            : 'border-slate-800 hover:border-slate-700'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <div className="flex flex-wrap items-center gap-1.5 flex-1">
          {selected.length === 0 ? (
            <span className="text-xs text-slate-500 flex items-center space-x-1.5 pl-1">
              <Globe className="w-3.5 h-3.5 text-slate-500" />
              <span>{placeholder}</span>
            </span>
          ) : (
            selected.map((country) => (
              <span
                key={country}
                className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-xs"
              >
                <span>{country}</span>
                <button
                  type="button"
                  onClick={(e) => removeCountry(e, country)}
                  className="hover:text-white p-0.5 rounded hover:bg-emerald-500/20 transition-colors ml-0.5"
                  aria-label={`Remove ${country}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))
          )}
        </div>

        <div className="flex items-center space-x-1 flex-shrink-0 text-slate-400 pr-1">
          {selected.length > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange([]);
              }}
              className="text-[10px] text-slate-400 hover:text-slate-200 px-1.5 py-0.5 rounded hover:bg-slate-800"
            >
              Clear
            </button>
          )}
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-2.5 space-y-2 animate-in fade-in zoom-in-95 duration-100">
          {/* Search Input */}
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (canAddCustom) handleAddCustom();
                }
              }}
              placeholder="Search or type custom country..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              autoFocus
            />
          </div>

          {/* Quick Preset Buttons */}
          <div className="flex items-center space-x-2 pb-1 border-b border-slate-800 text-[11px]">
            <button
              type="button"
              onClick={() => {
                const defaults = ['Egypt', 'United Arab Emirates', 'Germany', 'Remote (Global)'];
                onChange(Array.from(new Set([...selected, ...defaults])));
              }}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] transition-colors"
            >
              + Top Markets (EMEA & Remote)
            </button>
            <button
              type="button"
              onClick={() => {
                const gcc = ['United Arab Emirates', 'Saudi Arabia', 'Qatar', 'Kuwait', 'Bahrain', 'Oman'];
                onChange(Array.from(new Set([...selected, ...gcc])));
              }}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] transition-colors"
            >
              + GCC
            </button>
            <button
              type="button"
              onClick={() => {
                const eu = ['Germany', 'Netherlands', 'United Kingdom', 'France', 'Switzerland'];
                onChange(Array.from(new Set([...selected, ...eu])));
              }}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] transition-colors"
            >
              + Europe
            </button>
          </div>

          {/* Custom Country Add Option */}
          {canAddCustom && (
            <div
              onClick={handleAddCustom}
              className="p-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg text-emerald-400 text-xs flex items-center justify-between cursor-pointer transition-colors"
            >
              <div className="flex items-center space-x-1.5">
                <Plus className="w-3.5 h-3.5" />
                <span>Add "<strong>{search.trim()}</strong>" to target countries</span>
              </div>
              <span className="text-[10px] bg-emerald-500/20 px-1.5 py-0.5 rounded">Press Enter</span>
            </div>
          )}

          {/* Country List */}
          <div className="max-h-52 overflow-y-auto space-y-0.5 scrollbar-thin scrollbar-thumb-slate-800">
            {filteredCountries.map((country) => {
              const isChecked = selected.includes(country);
              return (
                <div
                  key={country}
                  onClick={() => toggleCountry(country)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer transition-colors ${
                    isChecked
                      ? 'bg-emerald-500/10 text-emerald-300 font-semibold'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <div
                      className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                        isChecked
                          ? 'bg-emerald-500 border-emerald-500 text-slate-950'
                          : 'border-slate-700 bg-slate-950'
                      }`}
                    >
                      {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <span>{country}</span>
                  </div>

                  {isChecked && <span className="text-[10px] text-emerald-400">Selected</span>}
                </div>
              );
            })}

            {filteredCountries.length === 0 && !canAddCustom && (
              <div className="p-3 text-center text-xs text-slate-500">
                No matching countries found.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
