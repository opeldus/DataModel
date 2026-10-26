package de.erdstudio.service;

public class ModelNotFoundException extends RuntimeException {
    public ModelNotFoundException(String id) {
        super("Modell " + id + " nicht gefunden.");
    }
}
