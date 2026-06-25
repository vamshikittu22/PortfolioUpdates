const { YoutubeTranscript } = require('youtube-transcript');

async function run() {
  const channelHandle = '@warikoo';
  const url = `https://www.youtube.com/${channelHandle}/videos`;
  console.log('Fetching channel page:', url);
  
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      }
    });
    const html = await res.text();
    const match = html.match(/var ytInitialData = ({.*?});/);
    if (!match) {
      console.log('Could not find ytInitialData');
      return;
    }
    const data = JSON.parse(match[1]);
    const tabs = data.contents?.twoColumnBrowseResultsRenderer?.tabs ?? [];
    const selectedTab = tabs.find(t => t.tabRenderer?.selected === true || t.tabRenderer?.title === 'Videos');
    const gridContents = selectedTab?.tabRenderer?.content?.richGridRenderer?.contents || [];
    
    console.log(`Found ${gridContents.length} items in grid`);
    const videos = [];
    for (const item of gridContents) {
      const vm = item.richItemRenderer?.content?.lockupViewModel;
      if (vm) {
        videos.push({
          id: vm.contentId,
          title: vm.metadata?.lockupMetadataViewModel?.title?.content || ''
        });
      }
    }
    
    console.log(`Extracted ${videos.length} videos`);
    for (let i = 0; i < Math.min(5, videos.length); i++) {
      const v = videos[i];
      console.log(`\nVideo ${i+1}: ${v.title} (${v.id})`);
      try {
        const segments = await YoutubeTranscript.fetchTranscript(v.id);
        console.log(`  -> SUCCESS! Fetched ${segments.length} segments.`);
      } catch (e) {
        console.log(`  -> FAILED: ${e.message}`);
      }
    }
  } catch (e) {
    console.error('Error:', e);
  }
}

run();
