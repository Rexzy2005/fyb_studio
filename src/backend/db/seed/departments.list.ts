export type DepartmentSeed = {
  name: string;
  abbreviation: string;
};

export const DEPARTMENT_SEED: ReadonlyArray<DepartmentSeed> = [
  { name: "Computer Science", abbreviation: "CSC" },
  { name: "Software Engineering", abbreviation: "SWE" },
  { name: "Electrical and Electronic Engineering", abbreviation: "EEE" },
  { name: "Mechanical Engineering", abbreviation: "MEE" },
  { name: "Civil Engineering", abbreviation: "CVE" },
  { name: "Chemical Engineering", abbreviation: "CHE" },
  { name: "Mass Communication", abbreviation: "MAC" },
  { name: "Accounting", abbreviation: "ACC" },
  { name: "Banking and Finance", abbreviation: "BNF" },
  { name: "Business Administration", abbreviation: "BUS" },
  { name: "Economics", abbreviation: "ECO" },
  { name: "Law", abbreviation: "LAW" },
  { name: "Medicine and Surgery", abbreviation: "MED" },
  { name: "Nursing", abbreviation: "NUR" },
  { name: "Pharmacy", abbreviation: "PHM" },
  { name: "Architecture", abbreviation: "ARC" },
  { name: "Estate Management", abbreviation: "ESM" },
  { name: "Political Science", abbreviation: "POL" },
  { name: "Sociology", abbreviation: "SOC" },
  { name: "Psychology", abbreviation: "PSY" },
  { name: "English Language", abbreviation: "ENG" },
  { name: "History", abbreviation: "HIS" },
  { name: "Mathematics", abbreviation: "MTH" },
  { name: "Physics", abbreviation: "PHY" },
  { name: "Chemistry", abbreviation: "CHM" },
  { name: "Biology", abbreviation: "BIO" },
  { name: "Microbiology", abbreviation: "MCB" },
  { name: "Biochemistry", abbreviation: "BCH" },
] as const;
