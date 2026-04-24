import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  addMcpServer,
  getClientsStatus,
  getClientTools,
  getMcpConfigFromFile,
  isMcpEnabled,
  pauseMcpServer,
  restartAllClients,
  resumeMcpServer,
} from "../mcp/actions";
import {
  ListToolsResponse,
  McpConfigData,
  PresetServer,
  ServerConfig,
  ServerStatusResponse,
} from "../mcp/types";
import { showToast } from "./ui-lib";
import { Path } from "../constant";

/**
 * Custom hook encapsulating all MCP server management state and operations.
 * Extracted from McpMarketPage to reduce component size.
 */
export function useMcpServerManager() {
  const navigate = useNavigate();
  const [mcpEnabled, setMcpEnabled] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [userConfig, setUserConfig] = useState<Record<string, any>>({});
  const [editingServerId, setEditingServerId] = useState<string | undefined>();
  const [tools, setTools] = useState<ListToolsResponse["tools"] | null>(null);
  const [viewingServerId, setViewingServerId] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [config, setConfig] = useState<McpConfigData>();
  const [clientStatuses, setClientStatuses] = useState<
    Record<string, ServerStatusResponse>
  >({});
  const [loadingPresets, setLoadingPresets] = useState(true);
  const [presetServers, setPresetServers] = useState<PresetServer[]>([]);
  const [loadingStates, setLoadingStates] = useState<Record<string, string>>(
    {},
  );

  // Check MCP enabled
  useEffect(() => {
    const checkMcpStatus = async () => {
      const enabled = await isMcpEnabled();
      setMcpEnabled(enabled);
      if (!enabled) {
        navigate(Path.Home);
      }
    };
    checkMcpStatus();
  }, [navigate]);

  // Status polling
  useEffect(() => {
    if (!mcpEnabled || !config) return;

    const updateStatuses = async () => {
      const statuses = await getClientsStatus();
      setClientStatuses(statuses);
    };

    updateStatuses();
    const timer = setInterval(updateStatuses, 1000);
    return () => clearInterval(timer);
  }, [mcpEnabled, config]);

  // Load preset servers
  useEffect(() => {
    const loadPresetServers = async () => {
      if (!mcpEnabled) return;
      try {
        setLoadingPresets(true);
        const response = await fetch("https://nextchat.club/mcp/list");
        if (!response.ok) {
          throw new Error("Failed to load preset servers");
        }
        const data = await response.json();
        setPresetServers(data?.data ?? []);
      } catch (error) {
        console.error("Failed to load preset servers:", error);
        showToast("Failed to load preset servers");
      } finally {
        setLoadingPresets(false);
      }
    };
    loadPresetServers();
  }, [mcpEnabled]);

  // Load initial state
  useEffect(() => {
    const loadInitialState = async () => {
      if (!mcpEnabled) return;
      try {
        setIsLoading(true);
        const config = await getMcpConfigFromFile();
        setConfig(config);
        const statuses = await getClientsStatus();
        setClientStatuses(statuses);
      } catch (error) {
        console.error("Failed to load initial state:", error);
        showToast("Failed to load initial state");
      } finally {
        setIsLoading(false);
      }
    };
    loadInitialState();
  }, [mcpEnabled]);

  // Load editing server config
  useEffect(() => {
    if (!editingServerId || !config) return;
    const currentConfig = config.mcpServers[editingServerId];
    if (currentConfig) {
      const preset = presetServers.find((s) => s.id === editingServerId);
      if (preset?.configSchema) {
        const extractedConfig: Record<string, any> = {};
        Object.entries(preset.argsMapping || {}).forEach(([key, mapping]) => {
          if (mapping.type === "spread") {
            const startPos = mapping.position ?? 0;
            extractedConfig[key] = currentConfig.args.slice(startPos);
          } else if (mapping.type === "single") {
            extractedConfig[key] = currentConfig.args[mapping.position ?? 0];
          } else if (
            mapping.type === "env" &&
            mapping.key &&
            currentConfig.env
          ) {
            extractedConfig[key] = currentConfig.env[mapping.key];
          }
        });
        setUserConfig(extractedConfig);
      }
    } else {
      setUserConfig({});
    }
  }, [editingServerId, config, presetServers]);

  // Helper: update loading state
  const updateLoadingState = (id: string, message: string | null) => {
    setLoadingStates((prev) => {
      if (message === null) {
        const { [id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: message };
    });
  };

  const isServerAdded = (id: string) => {
    return id in (config?.mcpServers ?? {});
  };

  const saveServerConfig = async () => {
    const preset = presetServers.find((s) => s.id === editingServerId);
    if (!preset || !preset.configSchema || !editingServerId) return;

    const savingServerId = editingServerId;
    setEditingServerId(undefined);

    try {
      updateLoadingState(savingServerId, "Updating configuration...");
      const args = [...preset.baseArgs];
      const env: Record<string, string> = {};

      Object.entries(preset.argsMapping || {}).forEach(([key, mapping]) => {
        const value = userConfig[key];
        if (mapping.type === "spread" && Array.isArray(value)) {
          const pos = mapping.position ?? 0;
          args.splice(pos, 0, ...value);
        } else if (
          mapping.type === "single" &&
          mapping.position !== undefined
        ) {
          args[mapping.position] = value;
        } else if (
          mapping.type === "env" &&
          mapping.key &&
          typeof value === "string"
        ) {
          env[mapping.key] = value;
        }
      });

      const serverConfig: ServerConfig = {
        command: preset.command,
        args,
        ...(Object.keys(env).length > 0 ? { env } : {}),
      };

      const newConfig = await addMcpServer(savingServerId, serverConfig);
      setConfig(newConfig);
      showToast("Server configuration updated successfully");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Failed to save configuration",
      );
    } finally {
      updateLoadingState(savingServerId, null);
    }
  };

  const loadTools = async (id: string) => {
    try {
      const result = await getClientTools(id);
      if (result) {
        setTools(result);
      } else {
        throw new Error("Failed to load tools");
      }
    } catch (error) {
      showToast("Failed to load tools");
      console.error(error);
      setTools(null);
    }
  };

  const addServer = async (preset: PresetServer) => {
    if (!preset.configurable) {
      try {
        const serverId = preset.id;
        updateLoadingState(serverId, "Creating MCP client...");

        const serverConfig: ServerConfig = {
          command: preset.command,
          args: [...preset.baseArgs],
        };
        const newConfig = await addMcpServer(preset.id, serverConfig);
        setConfig(newConfig);

        const statuses = await getClientsStatus();
        setClientStatuses(statuses);
      } finally {
        updateLoadingState(preset.id, null);
      }
    } else {
      setEditingServerId(preset.id);
      setUserConfig({});
    }
  };

  const pauseServer = async (id: string) => {
    try {
      updateLoadingState(id, "Stopping server...");
      const newConfig = await pauseMcpServer(id);
      setConfig(newConfig);
      showToast("Server stopped successfully");
    } catch (error) {
      showToast("Failed to stop server");
      console.error(error);
    } finally {
      updateLoadingState(id, null);
    }
  };

  const restartServer = async (id: string) => {
    try {
      updateLoadingState(id, "Starting server...");
      await resumeMcpServer(id);
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Failed to start server, please check logs",
      );
      console.error(error);
    } finally {
      updateLoadingState(id, null);
    }
  };

  const handleRestartAll = async () => {
    try {
      updateLoadingState("all", "Restarting all servers...");
      const newConfig = await restartAllClients();
      setConfig(newConfig);
      showToast("Restarting all clients");
    } catch (error) {
      showToast("Failed to restart clients");
      console.error(error);
    } finally {
      updateLoadingState("all", null);
    }
  };

  const checkServerStatus = (clientId: string) => {
    return clientStatuses[clientId] || { status: "undefined", errorMsg: null };
  };

  return {
    // State
    mcpEnabled,
    searchText,
    setSearchText,
    userConfig,
    setUserConfig,
    editingServerId,
    setEditingServerId,
    tools,
    viewingServerId,
    setViewingServerId,
    isLoading,
    config,
    loadingPresets,
    presetServers,
    loadingStates,
    // Actions
    isServerAdded,
    saveServerConfig,
    loadTools,
    addServer,
    pauseServer,
    restartServer,
    handleRestartAll,
    checkServerStatus,
    navigate,
  };
}
