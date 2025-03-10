package com.streamr.client_testing;

import com.streamr.client.rest.Stream;
import com.streamr.client.utils.Address;
import com.streamr.client.utils.GroupKey;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.function.Consumer;
import com.google.gson.JsonObject;

public class PublisherThreadJS extends PublisherThread {
    private static final Logger log = LogManager.getLogger(PublisherThreadJS.class);

    private final StreamrClientJS publisher;
    private Process p;
    private final String command;
    private Consumer<String> onPublished = null;
    private final Thread thread;
    private Thread errorLoggingThread;

    /**
     *
     * @param publisher
     * @param stream
     * @param publishFunction
     * @param interval I
     * @param maxMessages Number of messages to publish. Pass 0 for infinite.
     */
    public PublisherThreadJS(StreamrClientJS publisher, Stream stream, PublishFunction publishFunction, long interval, int maxMessages) {
        super(interval);
        this.publisher = publisher;
        JsonObject json = new JsonObject();
        json.addProperty("privateKey", publisher.getPrivateKey());
        json.addProperty("streamId", stream.getId());
        json.addProperty("publishFunctionName", publishFunction.getName());
        json.addProperty("interval", interval);
        json.addProperty("maxMessages", maxMessages);
        json.addProperty("groupKey", publisher.getGroupKey() == null ? "" : Utils.groupKeyToJson(publisher.getGroupKey()));

        if (publisher.getGroupKey() != null) {
            json.addProperty("groupKey", Utils.groupKeyToJson(publisher.getGroupKey()));
        }
        command = String.format("node --enable-source-maps publisher.js %s", json.toString());

        thread = new Thread(this::executeNode);
        thread.setName("JS-pub-" + getPublisherId().toString().substring(0, 6));
    }

    @Override
    public Address getPublisherId() {
        return publisher.getAddress();
    }

    @Override
    public void setOnPublished(Consumer<String> onPublished) {
        this.onPublished = onPublished;
    }

    @Override
    public void start() {
        thread.start();
    }

    private void executeNode() {
        try {
            p = Runtime.getRuntime().exec(command, null);

            Runtime.getRuntime().addShutdownHook(new Thread(new Runnable() {
                public void run() {
                    if (p.isAlive()) {
                        p.destroy();
                    }
                }
            }));

            final BufferedReader stdInput = new BufferedReader(new
                    InputStreamReader(p.getInputStream()));

            final BufferedReader stdError = new BufferedReader(new
                    InputStreamReader(p.getErrorStream()));

            errorLoggingThread = new Thread(() -> {
                try {
                    String err;
                    while ((err = stdError.readLine()) != null) {
                        log.warn(getPublisherId() + " " + err);
                    }
                } catch (IOException e) {
                    e.printStackTrace();
                }
            });

            errorLoggingThread.start();

            String s;
            while (!Thread.currentThread().isInterrupted() && (s = stdInput.readLine()) != null) {
                handleLine(s);
            }
            if (p.isAlive()) {
                p.destroy();
            }
            if (stdInput != null) {
                stdInput.close();
            }
            if (stdError != null) {
                stdError.close();
            }
        } catch (IOException e) {
            e.printStackTrace();
            System.exit(1);
        }
    }

    private void handleLine(String s) {
        // Handle the known things that publisher.js will log
        if (s.startsWith("Published: ")) {
            if (onPublished != null) {
                onPublished.accept(s.substring(12));
            }
        } else if (s.startsWith("Going to publish")) {
            log.debug(getPublisherId() + " " + s);
        } else if (s.startsWith("Rotating")) {
            log.debug(getPublisherId() + " " + s);
        } else if (s.startsWith("Done: ")) {
            log.info(getPublisherId() + " " + s);
        } else {
            log.debug(getPublisherId() + " " + s);
        }
    }

    @Override
    public void stop() {
        thread.interrupt();
        if (p.isAlive()) {
            p.destroy();
        }
    }

    @Override
    public boolean isReady() {
        return !thread.isAlive();
    }
}
