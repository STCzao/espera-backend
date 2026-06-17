import type { BusinessCategoryConfig } from "./BusinessCategoryConfig";

const defaultCategoryConfig = (categoryId: string): BusinessCategoryConfig => ({
  categoryId,
  attributes: [
    {
      key: "averageServiceMinutes",
      label: "Tiempo promedio por atencion",
      type: "number",
      required: true,
    },
    {
      key: "acceptsWalkIns",
      label: "Acepta personas sin reserva previa",
      type: "boolean",
      required: false,
    },
  ],
});

const categoryConfigs = new Map<string, BusinessCategoryConfig>([
  [
    "11111111-1111-4111-8111-111111111111",
    {
      categoryId: "11111111-1111-4111-8111-111111111111",
      attributes: [
        {
          key: "averageServiceMinutes",
          label: "Tiempo promedio por atencion",
          type: "number",
          required: true,
        },
        {
          key: "serviceMode",
          label: "Modalidad de atencion",
          type: "select",
          required: true,
          options: ["counter", "table", "pickup"],
        },
      ],
    },
  ],
  [
    "33333333-3333-4333-8333-333333333333",
    {
      categoryId: "33333333-3333-4333-8333-333333333333",
      attributes: [
        {
          key: "averageServiceMinutes",
          label: "Tiempo promedio por tramite",
          type: "number",
          required: true,
        },
        {
          key: "requiresDocumentation",
          label: "Requiere documentacion",
          type: "boolean",
          required: false,
        },
        {
          key: "serviceArea",
          label: "Area de atencion",
          type: "text",
          required: false,
        },
      ],
    },
  ],
]);

export class BusinessCategoryConfigRegistry {
  public getConfig(categoryId: string): BusinessCategoryConfig {
    return categoryConfigs.get(categoryId) ?? defaultCategoryConfig(categoryId);
  }
}
