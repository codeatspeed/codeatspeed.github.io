import { useEffect, useState, type ComponentType } from "react";

import type { Document } from "../domain/document";
import type { ReaderNotice } from "../domain/reader-state";
import { ImportPage } from "../features/import/ImportPage";
import { ReaderPage } from "../features/reader/ReaderPage";
import type { ImportResult } from "../features/import/import-controller";
import { listenToRoutes, navigate, parseRoute, type Route, type RouteResult } from "./router";


export type ReaderPageProps = {
  document: Document;
  initialNotice?: ReaderNotice;
};

export type ReaderPageComponent = ComponentType<ReaderPageProps>;


function initialRouteResult(): RouteResult {
  return parseRoute(window.location.hash);
}

export type AppProps = {
  readerPage?: ReaderPageComponent;
};

export function App({ readerPage }: AppProps = {}) {
  const [routeResult, setRouteResult] = useState<RouteResult>(initialRouteResult);
  const [importedDocument, setImportedDocument] = useState<Document>();
  const [importNotice, setImportNotice] = useState<ReaderNotice>();

  useEffect(() => listenToRoutes(setRouteResult), []);

  const onImported = ({ document, notice }: ImportResult) => {
    setImportedDocument(document);
    setImportNotice(notice);
    navigate({ name: "read", documentId: document.id });
  };

  const route: Route = routeResult.ok ? routeResult.route : { name: "home" };
  if (route.name === "read" && importedDocument?.id === route.documentId) {
    const Reader = readerPage ?? ReaderPage;
    return <Reader document={importedDocument} initialNotice={importNotice} />;
  }

  return (
    <ImportPage
      onImported={onImported}
    />
  );
}

export default App;
