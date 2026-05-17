"use client";

import type { DepartmentListItem } from "@/backend/services/department.service";
import { Select } from "@/components/ui/Input";

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
    <Select
      label="Department"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={loading || departments.length === 0}
    >
      <option value="" disabled>
        {loading ? "Loading departments…" : "Select your department"}
      </option>
      {departments.map((dept) => (
        <option key={dept.id} value={dept.id}>
          {dept.name}
          {dept.hasHead ? " - head taken" : ""}
        </option>
      ))}
    </Select>
  );
}
