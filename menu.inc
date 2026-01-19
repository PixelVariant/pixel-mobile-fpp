<?php

# Menu entries for DDP Mobile Cloud Connector plugin
$menuEntries = Array(
	Array(
		'text' => 'DDP Mobile - Settings',
		'type' => 'status',
		'page' => 'settings.php',
		'wrap' => 1
	),
	Array(
		'text' => 'DDP Mobile - Status',
		'type' => 'status',
		'page' => 'status.php',
		'wrap' => 1
	),
	Array(
		'text' => 'DDP Mobile - Help',
		'type' => 'help',
		'page' => 'help.php',
		'wrap' => 1
	),
	Array(
		'text' => 'DDP Mobile - About',
		'type' => 'help',
		'page' => 'about.php',
		'wrap' => 1
	)
);

# Display menu entries
foreach ($menuEntries as $entry) {
	if ($entry['type'] != $menu)
		continue;

	if (preg_match('/^http.?:\/\//', $entry['page'])) {
		printf("<li><a href='%s' target='_blank'>%s</a></li>\n",
			$entry['page'], $entry['text']);
	} else {
		$nopage = '';
		if (isset($entry['wrap']) && ($entry['wrap'] == 0))
			$nopage = '&nopage=1';

		printf("<li><a href='plugin.php?plugin=%s&page=%s%s'>%s</a></li>\n",
			$plugin, $entry['page'], $nopage, $entry['text']);
	}
}
?>
