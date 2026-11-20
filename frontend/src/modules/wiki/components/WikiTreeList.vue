<script setup lang="ts">
import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen } from 'lucide-vue-next'
import type { WikiPage } from '../wiki.api'
import type { WikiTreeNode } from '../wiki-tree'

defineProps<{
  nodes: WikiTreeNode[]
  selectedId: string | null
  activeFolderId: string | null
  expanded: Set<string>
  depth: number
}>()

const emit = defineEmits<{
  open: [page: WikiPage]
  toggle: [folderId: string]
  'select-folder': [folderId: string | null]
}>()
</script>

<template>
  <div>
    <template v-for="node in nodes" :key="node.id">
      <button
        v-if="node.kind === 'folder'"
        type="button"
        class="flex w-full items-center gap-1.5 border-b border-border/40 py-2 pr-2 text-left transition-colors"
        :class="activeFolderId === node.id ? 'bg-accent/70' : 'hover:bg-accent/40'"
        :style="{ paddingLeft: `${10 + depth * 14}px` }"
        @click="emit('select-folder', node.id); emit('toggle', node.id)"
      >
        <ChevronDown v-if="expanded.has(node.id)" class="size-3.5 shrink-0 text-muted-foreground" />
        <ChevronRight v-else class="size-3.5 shrink-0 text-muted-foreground" />
        <FolderOpen v-if="expanded.has(node.id)" class="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <Folder v-else class="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <span class="min-w-0 flex-1 truncate text-[13px] font-medium">{{ node.title }}</span>
      </button>
      <WikiTreeList
        v-if="node.kind === 'folder' && expanded.has(node.id)"
        :nodes="node.children"
        :selected-id="selectedId"
        :active-folder-id="activeFolderId"
        :expanded="expanded"
        :depth="depth + 1"
        @open="emit('open', $event)"
        @toggle="emit('toggle', $event)"
        @select-folder="emit('select-folder', $event)"
      />
      <button
        v-else-if="node.kind !== 'folder'"
        type="button"
        class="flex w-full items-start gap-2 border-b border-border/50 py-2.5 pr-3 text-left transition-colors"
        :class="selectedId === node.id ? 'bg-accent' : 'hover:bg-accent/50'"
        :style="{ paddingLeft: `${12 + depth * 14}px` }"
        @click="emit('open', node)"
      >
        <FileText class="mt-0.5 size-4 shrink-0 text-primary" />
        <span class="min-w-0 flex-1">
          <span class="block truncate text-[13px] font-medium">{{ node.title }}</span>
          <span v-if="node.excerpt" class="mt-0.5 line-clamp-2 block text-[11px] text-muted-foreground">{{ node.excerpt }}</span>
        </span>
      </button>
    </template>
  </div>
</template>
