"use client";

import type { DepartmentListItem } from "@/backend/services/department.service";

export function DepartmentSelect({
  departments,
  value,
  onChange,
  loading,
}: {
  departments: DepartmentListItem[];
  value: string;
  onChange: (id: string) => void;
  loading: boolean;
}) {
  return (
    <div>
      <label className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
        Department
      </label>
      <div className="mt-1 rounded-2xl border border-zinc-200 bg-white px-3 dark:border-zinc-800 dark:bg-zinc-900 focus-within:border-zinc-400 dark:focus-within:border-zinc-600">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={loading || departments.length === 0}
          className="h-11 w-full appearance-none bg-transparent text-sm text-zinc-900 outline-none disabled:cursor-not-allowed dark:text-zinc-100"
        >
          <option value="" disabled>
            {loading ? "Loading departments…" : "Select your department"}
          </option>
          {departments.map((dept) => (
            <option key={dept.id} value={dept.id}>
              {dept.name}
              {dept.hasHead ? " — head taken" : ""}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
