package de.erdstudio.export;

import de.erdstudio.model.Kernmodell.Attribute;
import de.erdstudio.model.Kernmodell.DataType;
import de.erdstudio.model.Kernmodell.Entity;

import java.util.Comparator;
import java.util.List;
import java.util.regex.Pattern;

final class ExportSupport {

    private static final Pattern PLAIN_IDENT = Pattern.compile("[A-Za-z_][A-Za-z0-9_]*");

    private ExportSupport() {
    }

    static boolean isPlainIdentifier(String s) {
        return PLAIN_IDENT.matcher(s).matches();
    }

    static List<Attribute> orderedAttributes(Entity e) {
        return e.attributesOrEmpty().stream()
                .sorted(Comparator.comparing(a -> a.ordinalPosition() == null ? Integer.MAX_VALUE : a.ordinalPosition()))
                .toList();
    }

    /** Generischer SQL-Typ (nativeType hat Vorrang, damit Rundreisen verlustfrei bleiben). */
    static String sqlType(DataType dt) {
        if (dt.nativeType() != null && !dt.nativeType().isBlank()) {
            return dt.nativeType();
        }
        return switch (dt.type()) {
            case "string" -> dt.length() != null ? "VARCHAR(" + dt.length() + ")" : "VARCHAR";
            case "integer" -> "INTEGER";
            case "decimal" -> "NUMBER(" + dt.precision() + "," + (dt.scale() == null ? 0 : dt.scale()) + ")";
            case "float" -> "FLOAT";
            case "boolean" -> "BOOLEAN";
            case "date" -> "DATE";
            case "time" -> "TIME";
            case "timestamp" -> "TIMESTAMP_NTZ";
            case "timestamp_tz" -> "TIMESTAMP_TZ";
            case "binary" -> "BINARY";
            case "json" -> "VARIANT";
            case "array" -> "ARRAY";
            case "uuid" -> "VARCHAR(36)";
            default -> dt.type().toUpperCase();
        };
    }

    static String singleQuoted(String s) {
        return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'";
    }
}
