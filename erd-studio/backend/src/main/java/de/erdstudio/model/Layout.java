package de.erdstudio.model;

import java.util.Map;

/**
 * Diagramm-Layout eines Modells. Wird bewusst getrennt vom Modell gespeichert,
 * damit Verschieben von Tabellen keine fachliche Modelländerung erzeugt.
 *
 * @param positions Position je Entitäts-ID
 */
public record Layout(Map<String, Position> positions) {

    public record Position(double x, double y) {
    }
}
