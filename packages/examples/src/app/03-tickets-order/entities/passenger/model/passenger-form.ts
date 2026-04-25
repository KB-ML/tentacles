import { createFormContract, type ExtractValues } from "@kbml-tentacles/forms";

export type Gender = "m" | "f";

export type DocumentType =
  | "national-id"
  | "birth-id"
  | "international-id"
  | "seaman-id"
  | "foreign-id"
  | "military-ticket"
  | "serviceman-ticket";

export type Citizenship = "ua" | "bel" | "kz" | "uzb";
export type ServiceCategory = "mobilized" | "cadet" | "contractor" | "conscript";

export const documentTypes: { value: DocumentType; label: string }[] = [
  { value: "national-id", label: "National ID" },
  { value: "birth-id", label: "Birth certificate" },
  { value: "international-id", label: "International passport" },
  { value: "seaman-id", label: "Seaman passport" },
  { value: "foreign-id", label: "Foreign passport" },
  { value: "military-ticket", label: "Military ticket" },
  { value: "serviceman-ticket", label: "Serviceman ticket" },
];

export const citizenships: { value: Citizenship; label: string }[] = [
  { value: "ua", label: "Ukraine" },
  { value: "bel", label: "Belarus" },
  { value: "kz", label: "Kazakhstan" },
  { value: "uzb", label: "Uzbekistan" },
];

export const categories: { value: ServiceCategory; label: string }[] = [
  { value: "mobilized", label: "Mobilized" },
  { value: "cadet", label: "Cadet" },
  { value: "contractor", label: "Contractor" },
  { value: "conscript", label: "Conscript" },
];

export const passengerFormContract = createFormContract()
  .field("firstname", (f) => f<string>().default("").required("First name is required"))
  .field("lastname", (f) => f<string>().default("").required("Last name is required"))
  .field("hasMiddlename", (f) => f<boolean>().default(true))
  .field("middlename", (f) =>
    f<string>()
      .default("")
      .dependsOn("hasMiddlename")
      .custom((v, ctx) => {
        const { hasMiddlename } = ctx.values as { hasMiddlename: boolean };
        if (hasMiddlename && !(v as string).trim()) return "Middle name is required";
        return null;
      }),
  )
  .field("gender", (f) => f<Gender | null>().default(null).required("Gender is required"))
  .field("birthday", (f) => f<string>().default("").required("Birthday is required"))
  .field("documentType", (f) => f<DocumentType>().default("national-id"))
  .field("documentNumber", (f) => f<string>().default("").required("Document number is required"))
  .field("citizenship", (f) =>
    f<Citizenship | null>()
      .default(null)
      .dependsOn("documentType")
      .custom((v, ctx) => {
        const { documentType } = ctx.values as { documentType: DocumentType };
        if (documentType === "foreign-id" && v == null) return "Citizenship is required";
        return null;
      }),
  )
  .field("category", (f) =>
    f<ServiceCategory | null>()
      .default(null)
      .dependsOn("documentType")
      .custom((v, ctx) => {
        const { documentType } = ctx.values as { documentType: DocumentType };
        const isMilitary =
          documentType === "military-ticket" || documentType === "serviceman-ticket";
        if (isMilitary && v == null) return "Category is required";
        return null;
      }),
  )
  .field("notServed", (f) => f<boolean>().default(false))
  .field("startDate", (f) =>
    f<string>()
      .default("")
      .dependsOn(["documentType", "notServed"])
      .custom((v, ctx) => {
        const { documentType, notServed } = ctx.values as {
          documentType: DocumentType;
          notServed: boolean;
        };
        const isMilitary =
          documentType === "military-ticket" || documentType === "serviceman-ticket";
        if (isMilitary && !notServed && !(v as string).trim()) {
          return "Service start date is required";
        }
        return null;
      }),
  );

export type PassengerValues = ExtractValues<typeof passengerFormContract>;
