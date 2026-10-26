package de.erdstudio;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class ErdStudioApplicationTests {

    private static final String UNKNOWN_ID = "8f0dbd7b-c7b0-5d6c-9a4c-6f2c2b0a3f4c";

    @DynamicPropertySource
    static void modelDir(DynamicPropertyRegistry registry) throws Exception {
        Path dir = Files.createTempDirectory("erd-test");
        registry.add("erd.model-dir", dir::toString);
    }

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper mapper;

    private ObjectNode sample() throws Exception {
        return (ObjectNode) mapper.readTree(new ClassPathResource("samples/kreditbestand.json").getInputStream());
    }

    private String sampleId() throws Exception {
        return sample().path("model").path("id").asText();
    }

    @Test
    void listsSeededSamples() throws Exception {
        mvc.perform(get("/api/models")).andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(2)));
    }

    @Test
    void storedSampleIsValid() throws Exception {
        mvc.perform(get("/api/models/" + sampleId() + "/validation"))
                .andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void detectsBrokenReference() throws Exception {
        ObjectNode m = sample();
        ((ObjectNode) m.withArray("relationships").get(0).get("to")).put("entityId", UNKNOWN_ID);
        mvc.perform(post("/api/validate").contentType(MediaType.APPLICATION_JSON).content(m.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].source").value("REFERENZ"));
    }

    @Test
    void rejectsSchemaViolationOnImport() throws Exception {
        ObjectNode m = sample();
        ((ObjectNode) m.get("model")).put("id", "8f0dbd7b-0000-4000-8000-000000000999");
        ((ObjectNode) ((ArrayNode) m.get("entities")).get(0)).remove("attributes");
        mvc.perform(post("/api/models").contentType(MediaType.APPLICATION_JSON).content(m.toString()))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.issues[0].source").value("SCHEMA"));
    }

    @Test
    void exportsAllFormats() throws Exception {
        String id = sampleId();
        mvc.perform(get("/api/models/" + id + "/export/dbml"))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("Ref FK_KV_GP: CORE.KREDITVERTRAG.GP_ID > CORE.GESCHAEFTSPARTNER.GP_ID")))
                .andExpect(content().string(containsString("(VERTRAG_NR, LFD_NR) [pk]")));
        mvc.perform(get("/api/models/" + id + "/export/mermaid"))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("KREDITVERTRAG ||--|{ ZAHLUNGSSTROM")));
        mvc.perform(get("/api/models/" + id + "/export/snowflake-ddl"))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("CONSTRAINT PK_ZAHLUNGSSTROM PRIMARY KEY (VERTRAG_NR, LFD_NR)")));
    }

    @Test
    void savesLayoutOnlyForKnownEntities() throws Exception {
        String id = sampleId();
        String entityId = sample().path("entities").get(0).path("id").asText();
        String body = "{\"positions\":{\"" + entityId + "\":{\"x\":10,\"y\":20},\"" + UNKNOWN_ID + "\":{\"x\":1,\"y\":1}}}";
        mvc.perform(put("/api/models/" + id + "/layout").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.positions['" + entityId + "'].x").value(10.0))
                .andExpect(jsonPath("$.positions['" + UNKNOWN_ID + "']").doesNotExist());
    }

    @Test
    void rejectsPathTraversal() throws Exception {
        mvc.perform(get("/api/models/..%2F..%2Fetc%2Fpasswd")).andExpect(status().is4xxClientError());
    }
}
