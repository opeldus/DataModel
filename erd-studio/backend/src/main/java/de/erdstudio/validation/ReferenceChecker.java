package de.erdstudio.validation;

import de.erdstudio.model.Kernmodell;
import de.erdstudio.model.Kernmodell.Entity;
import de.erdstudio.model.Kernmodell.RelationshipEnd;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Referenzielle Integrität des Kernmodells: IDs eindeutig, Verweise auflösbar,
 * PK-Spalten nicht nullable, Tabellen- und Spaltennamen eindeutig. Reines Java, ohne Spring.
 */
public final class ReferenceChecker {

    private ReferenceChecker() {
    }

    public static List<ValidationIssue> check(Kernmodell m) {
        List<ValidationIssue> issues = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        Set<String> domainIds = new HashSet<>();

        checkUnique(seen, m.model().id(), "$.model.id", issues);
        for (int i = 0; i < m.domainsOrEmpty().size(); i++) {
            var d = m.domainsOrEmpty().get(i);
            checkUnique(seen, d.id(), "$.domains[" + i + "].id", issues);
            domainIds.add(d.id());
        }

        Set<String> tableNames = new HashSet<>();
        for (int i = 0; i < m.entitiesOrEmpty().size(); i++) {
            Entity e = m.entitiesOrEmpty().get(i);
            String p = "$.entities[" + i + "]";
            checkUnique(seen, e.id(), p + ".id", issues);

            String qualified = (e.schema() == null ? "" : e.schema() + ".") + e.technicalName();
            if (!tableNames.add(qualified.toUpperCase(Locale.ROOT))) {
                issues.add(ValidationIssue.reference(p, "Tabellenname '" + qualified + "' ist doppelt vergeben."));
            }
            if (e.domainId() != null && !domainIds.contains(e.domainId())) {
                issues.add(ValidationIssue.reference(p + ".domainId", "Domäne " + e.domainId() + " existiert nicht."));
            }

            Set<String> columnNames = new HashSet<>();
            for (int j = 0; j < e.attributesOrEmpty().size(); j++) {
                var a = e.attributesOrEmpty().get(j);
                checkUnique(seen, a.id(), p + ".attributes[" + j + "].id", issues);
                if (!columnNames.add(a.technicalName().toUpperCase(Locale.ROOT))) {
                    issues.add(ValidationIssue.reference(p + ".attributes[" + j + "]",
                            "Spalte '" + a.technicalName() + "' kommt in " + e.technicalName() + " mehrfach vor."));
                }
            }

            for (String pk : e.primaryKeyIds()) {
                if (e.attribute(pk).isEmpty()) {
                    issues.add(ValidationIssue.reference(p + ".primaryKey",
                            "PK-Attribut " + pk + " gehört nicht zu " + e.technicalName() + "."));
                } else if (e.attribute(pk).get().isNullable()) {
                    issues.add(ValidationIssue.reference(p + ".primaryKey",
                            "PK-Attribut " + e.attribute(pk).get().technicalName() + " muss nullable=false haben."));
                }
            }
            for (int k = 0; k < e.uniqueKeysOrEmpty().size(); k++) {
                for (String uk : e.uniqueKeysOrEmpty().get(k).attributeIds()) {
                    if (e.attribute(uk).isEmpty()) {
                        issues.add(ValidationIssue.reference(p + ".uniqueKeys[" + k + "]",
                                "UK-Attribut " + uk + " gehört nicht zu " + e.technicalName() + "."));
                    }
                }
            }
        }

        for (int i = 0; i < m.relationshipsOrEmpty().size(); i++) {
            var r = m.relationshipsOrEmpty().get(i);
            String p = "$.relationships[" + i + "]";
            checkUnique(seen, r.id(), p + ".id", issues);
            checkEnd(m, r.from(), p + ".from", issues);
            checkEnd(m, r.to(), p + ".to", issues);
            if (r.from().attributeIds().size() != r.to().attributeIds().size()) {
                issues.add(ValidationIssue.reference(p,
                        "Anzahl der Attribute in 'from' und 'to' muss gleich sein."));
            }
        }
        return issues;
    }

    private static void checkEnd(Kernmodell m, RelationshipEnd end, String path, List<ValidationIssue> issues) {
        var entity = m.entity(end.entityId());
        if (entity.isEmpty()) {
            issues.add(ValidationIssue.reference(path + ".entityId", "Entität " + end.entityId() + " existiert nicht."));
            return;
        }
        for (String a : end.attributeIds()) {
            if (entity.get().attribute(a).isEmpty()) {
                issues.add(ValidationIssue.reference(path + ".attributeIds",
                        "Attribut " + a + " gehört nicht zu " + entity.get().technicalName() + "."));
            }
        }
    }

    private static void checkUnique(Set<String> seen, String id, String path, List<ValidationIssue> issues) {
        if (!seen.add(id)) {
            issues.add(ValidationIssue.reference(path, "ID " + id + " ist nicht eindeutig."));
        }
    }
}
