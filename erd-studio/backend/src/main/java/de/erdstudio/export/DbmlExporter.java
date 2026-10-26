package de.erdstudio.export;

import de.erdstudio.model.Kernmodell;
import de.erdstudio.model.Kernmodell.Attribute;
import de.erdstudio.model.Kernmodell.Entity;
import de.erdstudio.model.Kernmodell.RelationshipEnd;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static de.erdstudio.export.ExportSupport.isPlainIdentifier;
import static de.erdstudio.export.ExportSupport.orderedAttributes;
import static de.erdstudio.export.ExportSupport.singleQuoted;
import static de.erdstudio.export.ExportSupport.sqlType;

/** Kernmodell → DBML (dbdiagram.io, dbdocs.io). Kardinalität 0/1 geht dabei auf "viele/eins" verloren. */
@Component
public class DbmlExporter implements ModelExporter {

    @Override
    public String format() {
        return "dbml";
    }

    @Override
    public String label() {
        return "DBML (dbdiagram.io)";
    }

    @Override
    public String fileExtension() {
        return "dbml";
    }

    @Override
    public String export(Kernmodell m) {
        Map<String, Attribute> attrs = m.entitiesOrEmpty().stream()
                .flatMap(e -> e.attributesOrEmpty().stream())
                .collect(Collectors.toMap(Attribute::id, a -> a));
        StringBuilder out = new StringBuilder();
        var info = m.model();

        out.append("Project ").append(q(info.name())).append(" {\n");
        if (info.targetPlatform() != null) {
            out.append("  database_type: ").append(singleQuoted(info.targetPlatform())).append('\n');
        }
        String desc = Objects.requireNonNullElse(info.description(), "") + " (Version " + info.version() + ")";
        out.append("  Note: ").append(singleQuoted(desc.strip())).append("\n}\n\n");

        for (Entity e : m.entitiesOrEmpty()) {
            List<String> pk = e.primaryKeyIds();
            out.append("Table ").append(tableRef(e));
            if (e.physicalName() != null && !e.name().equals(e.physicalName())) {
                out.append(" as ").append(q(e.name()));
            }
            out.append(" {\n");

            for (Attribute a : orderedAttributes(e)) {
                List<String> settings = new ArrayList<>();
                if (pk.size() == 1 && pk.contains(a.id())) {
                    settings.add("pk");
                }
                if (!a.isNullable()) {
                    settings.add("not null");
                }
                if (a.defaultValue() != null) {
                    Object dv = a.defaultValue();
                    settings.add("default: " + (dv instanceof String s ? singleQuoted(s) : dv.toString()));
                }
                String note = a.description() != null ? a.description() : a.name();
                if (note != null) {
                    settings.add("note: " + singleQuoted(note));
                }
                String type = sqlType(a.dataType());
                out.append("  ").append(q(a.technicalName())).append(' ')
                        .append(type.contains(" ") ? "\"" + type + "\"" : type)
                        .append(settings.isEmpty() ? "" : " [" + String.join(", ", settings) + "]")
                        .append('\n');
            }

            List<String> indexes = new ArrayList<>();
            if (pk.size() > 1) {
                indexes.add("    (" + columns(pk, attrs) + ") [pk]");
            }
            for (var uk : e.uniqueKeysOrEmpty()) {
                indexes.add("    (" + columns(uk.attributeIds(), attrs) + ") [unique"
                        + (uk.name() != null ? ", name: " + singleQuoted(uk.name()) : "") + "]");
            }
            if (!indexes.isEmpty()) {
                out.append("\n  indexes {\n").append(String.join("\n", indexes)).append("\n  }\n");
            }

            String tableNote = Stream.of(
                            e.description(),
                            e.dataProduct() == null ? null : "Data Product: " + e.dataProduct(),
                            e.classification() == null ? null : "Klassifizierung: " + e.classification())
                    .filter(Objects::nonNull).collect(Collectors.joining(" | "));
            if (!tableNote.isEmpty()) {
                out.append("  Note: ").append(singleQuoted(tableNote)).append('\n');
            }
            out.append("}\n\n");
        }

        for (var r : m.relationshipsOrEmpty()) {
            Entity child = m.entity(r.from().entityId()).orElseThrow();
            Entity parent = m.entity(r.to().entityId()).orElseThrow();
            String op = operator(r.from(), r.to());
            out.append("Ref").append(r.name() != null ? " " + q(r.name()) : "").append(": ")
                    .append(colRef(child, r.from().attributeIds(), attrs)).append(' ').append(op).append(' ')
                    .append(colRef(parent, r.to().attributeIds(), attrs)).append('\n');
        }

        for (var d : m.domainsOrEmpty()) {
            List<String> members = m.entitiesOrEmpty().stream()
                    .filter(e -> d.id().equals(e.domainId())).map(DbmlExporter::tableRef).toList();
            if (!members.isEmpty()) {
                out.append("\nTableGroup ").append(q(d.name())).append(" {\n");
                members.forEach(t -> out.append("  ").append(t).append('\n'));
                out.append("}\n");
            }
        }
        return out.toString();
    }

    private static String operator(RelationshipEnd from, RelationshipEnd to) {
        if (from.isMany() && to.isMany()) {
            return "<>";
        }
        if (from.isMany()) {
            return ">";
        }
        return to.isMany() ? "<" : "-";
    }

    private static String q(String name) {
        return isPlainIdentifier(name) ? name : "\"" + name.replace("\"", "\\\"") + "\"";
    }

    private static String tableRef(Entity e) {
        return (e.schema() != null ? q(e.schema()) + "." : "") + q(e.technicalName());
    }

    private static String columns(List<String> ids, Map<String, Attribute> attrs) {
        return ids.stream().map(id -> q(attrs.get(id).technicalName())).collect(Collectors.joining(", "));
    }

    private static String colRef(Entity e, List<String> ids, Map<String, Attribute> attrs) {
        return ids.size() == 1
                ? tableRef(e) + "." + q(attrs.get(ids.get(0)).technicalName())
                : tableRef(e) + ".(" + columns(ids, attrs) + ")";
    }
}
