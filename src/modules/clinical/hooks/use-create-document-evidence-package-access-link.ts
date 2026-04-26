"use client";

import { useMutation } from "@tanstack/react-query";
import {
  createDocumentEvidencePackageAccessLink,
  type ClinicalDocumentEvidencePackageAccessLink,
} from "../api/create-document-evidence-package-access-link";

export function useCreateDocumentEvidencePackageAccessLink() {
  return useMutation<ClinicalDocumentEvidencePackageAccessLink, Error, string>({
    mutationFn: (documentId) => createDocumentEvidencePackageAccessLink(documentId),
  });
}
