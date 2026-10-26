package de.erdstudio.service;

public class ModelConflictException extends RuntimeException {
    public ModelConflictException(String id) {
        super("Ein Modell mit der ID " + id + " existiert bereits. Zum Ersetzen PUT /api/models/" + id + " verwenden.");
    }
}
