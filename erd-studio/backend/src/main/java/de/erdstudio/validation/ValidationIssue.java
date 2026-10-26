package de.erdstudio.validation;

/**
 * Ein Befund der Modellprüfung.
 *
 * @param source  SCHEMA (JSON-Schema-Verstoß) oder REFERENZ (inhaltliche Prüfung)
 * @param path    Fundstelle im Modell (JSON-Pfad)
 * @param message Beschreibung auf Deutsch
 */
public record ValidationIssue(String source, String path, String message) {

    public static ValidationIssue schema(String path, String message) {
        return new ValidationIssue("SCHEMA", path, message);
    }

    public static ValidationIssue reference(String path, String message) {
        return new ValidationIssue("REFERENZ", path, message);
    }
}
