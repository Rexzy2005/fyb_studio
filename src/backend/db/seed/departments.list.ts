export type DepartmentSeed = {
  name: string;
  abbreviation: string;
};

export const DEPARTMENT_SEED: ReadonlyArray<DepartmentSeed> = [
  { name: "Electrical and Electronic Engineering", abbreviation: "EEE" },
  { name: "Mechanical Engineering", abbreviation: "MEE" },
  { name: "Civil Engineering", abbreviation: "CVE" },
  { name: "Military History", abbreviation: "MH" },
  { name: "Accounting", abbreviation: "ACC" },
  { name: "Economics", abbreviation: "ECO" },
  { name: "Management", abbreviation: "MGT" },
  { name: "Transport & Logistics", abbreviation: "TL" },
  { name: "Criminology", abbreviation: "CRIM" },
  { name: "Geography", abbreviation: "GEOG" },
  { name: "Political Science", abbreviation: "POLS" },
  { name: "International Relations", abbreviation: "IR" },
  { name: "Peace & Conflict", abbreviation: "PC" },
  { name: "Psychology", abbreviation: "PSY" },
  { name: "Sociology", abbreviation: "SOC" },
  { name: "Biology", abbreviation: "BIO" },
  { name: "Chemistry", abbreviation: "CHEM" },
  { name: "Mathematics", abbreviation: "MATH" },
  { name: "Physics", abbreviation: "PHY" },
  { name: "Information System", abbreviation: "IS" },
  { name: "Computer Science", abbreviation: "CSC" },
  { name: "Cyber Security", abbreviation: "CYB" },
  { name: "Information Technology", abbreviation: "IT" },
  { name: "Software Engineering", abbreviation: "SWE" },
  { name: "English Language", abbreviation: "ENG" },
] as const;
