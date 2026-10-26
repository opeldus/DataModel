package de.erdstudio.export;

import de.erdstudio.model.Kernmodell;
import de.erdstudio.model.Kernmodell.Attribute;
import de.erdstudio.model.Kernmodell.Entity;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import static de.erdstudio.export.ExportSupport.orderedAttributes;
import static de.erdstudio.export.ExportSupport.sqlType;

/**
 * Kernmodell → Snowflake DDL. PK/UK/FK werden als informative Constraints erzeugt
 * (Snowflake erzwingt sie nicht, Tools wie SQLdbm oder erwin lesen sie aber per Reverse Engineering).
 */
@Component
public class SnowflakeDdlExporter implements ModelExporter {

    @Override
    public String format() {
        return "snowflake-ddl";
    }

    @Override
    public String label() {
        return "Snowflake DDL";
    }

    @Override
    public String fileExtension() {
        return "sql";
    }

    @Override
    public String export(Kernmodell m) {
        Map<String, Attribute> attrs = m.entitiesOrEmpty().stream()
                .flatMap(e -> e.attributesOrEmpty().stream())
                .collect(Collectors.toMap(Attribute::id, a -> a));
        StringBuilder out = new StringBuilder();
        out.append("-- Generiert aus Kernmodell '").append(m.model().name())
                .append("' Version ").append(m.model().version()).append("\n\n");

        for (Entity e : m.entitiesOrEmpty()) {
            List<String> lines = new ArrayList<>();
            for (Attribute a : orderedAttributes(e)) {
                StringBuilder col = new StringBuilder("    ").append(a.technicalName()).append(' ')
                        .append(sqlType(a.dataType()));
                if (!a.isNullable()) {
                    col.append(" NOT NULL");
                }
                if (a.defaultValue() != null) {
                    Object dv = a.defaultValue();
                    col.append(" DEFAULT ").append(dv instanceof String s ? sql(s) : dv.toString());
                }
                String comment = a.description() != null ? a.description() : a.name();
                if (comment != null) {
                    col.append(" COMMENT ").append(sql(comment));
                }
                lines.add(col.toString());
            }
            if (!e.primaryKeyIds().isEmpty()) {
                String name = e.primaryKey().name() != null ? e.primaryKey().name() : "PK_" + e.technicalName();
                lines.add("    CONSTRAINT " + name + " PRIMARY KEY (" + cols(e.primaryKeyIds(), attrs) + ")");
            }
            int n = 1;
            for (var uk : e.uniqueKeysOrEmpty()) {
                String name = uk.name() != null ? uk.name() : "UK_" + e.technicalName() + "_" + n++;
                lines.add("    CONSTRAINT " + name + " UNIQUE (" + cols(uk.attributeIds(), attrs) + ")");
            }

            String comment = e.description() != null ? e.description() : e.name();
            out.append("CREATE TABLE IF NOT EXISTS ").append(qualified(e)).append(" (\n")
                    .append(String.join(",\n", lines)).append("\n)")
                    .append(comment != null ? "\nCOMMENT = " + sql(comment) : "")
                    .append(";\n\n");
        }

        for (var r : m.relationshipsOrEmpty()) {
            Entity child = m.entity(r.from().entityId()).orElseThrow();
            Entity parent = m.entity(r.to().entityId()).orElseThrow();
            String name = r.name() != null ? r.name() : "FK_" + child.technicalName() + "_" + parent.technicalName();
            out.append("ALTER TABLE ").append(qualified(child))
                    .append(" ADD CONSTRAINT ").append(name)
                    .append(" FOREIGN KEY (").append(cols(r.from().attributeIds(), attrs)).append(")")
                    .append(" REFERENCES ").append(qualified(parent))
                    .append(" (").append(cols(r.to().attributeIds(), attrs)).append(");\n");
        }
        return out.toString();
    }

    private static String qualified(Entity e) {
        return (e.database() != null ? e.database() + "." : "")
                + (e.schema() != null ? e.schema() + "." : "")
                + e.technicalName();
    }

    private static String cols(List<String> ids, Map<String, Attribute> attrs) {
        return ids.stream().map(id -> attrs.get(id).technicalName()).collect(Collectors.joining(", "));
    }

    private static String sql(String s) {
        return "'" + s.replace("'", "''") + "'";
    }
}
