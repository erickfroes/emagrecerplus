"use client";

import { useMutation } from "@tanstack/react-query";
import {
  getDocumentAccessLinks,
  type EncounterDocumentAccessLinksResponse,
} from "../api/get-document-access-links";

export function useDocumentAccessLinks() {
  return useMutation<EncounterDocumentAccessLinksResponse, Error, string>({
    mutationFn: (documentId) => getDocumentAccessLinks(documentId),
  });
}
