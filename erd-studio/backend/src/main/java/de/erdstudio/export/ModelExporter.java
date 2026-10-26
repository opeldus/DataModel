package de.erdstudio.export;

import de.erdstudio.model.Kernmodell;

/**
 * Adapter für ein Austauschformat. Neue Formate = neue Spring-Bean, Kern bleibt unverändert.
 */
public interface ModelExporter {

    /** Kurzname für die API, z. B. "dbml". */
    String format();

    /** Anzeigename, z. B. "DBML (dbdiagram.io)". */
    String label();

    String fileExtension();

    String export(Kernmodell model);
}
