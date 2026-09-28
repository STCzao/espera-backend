export type BusinessCategoryAttributeType = "boolean" | "number" | "select" | "text";

export interface BusinessCategoryAttribute {
  key: string;
  label: string;
  type: BusinessCategoryAttributeType;
  required: boolean;
  options?: string[];
}

export interface BusinessCategoryConfig {
  categoryId: string;
  attributes: BusinessCategoryAttribute[];
}
