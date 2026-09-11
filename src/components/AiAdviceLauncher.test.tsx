import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import '@testing-library/jest-dom/vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {AiAdviceLauncher} from './AiAdviceLauncher';
import {Tabs,TabsContent,TabsList,TabsTrigger} from './ui/tabs';

const mock=vi.hoisted(()=>({service:vi.fn()}));
vi.mock('@/lib/ai',()=>({callService:mock.service}));

const premium={plan:'premium',canPreview:true,features:{aiReview:true,aiChat:true,dailySummaryEmail:true}};

describe('AI advice follow-up',()=>{
  afterEach(()=>{cleanup();localStorage.clear();});
  beforeEach(()=>mock.service.mockReset());

  it('places text and voice question controls below the generated advice',async()=>{
    mock.service.mockImplementation(async(name,data)=>{
      if(name==='getFamilyAccess')return premium;
      if(name==='twinlyAi'&&data?.mode==='review')return {observations:'最近は安定しています',checks:'今日も睡眠を確認してください',generatedAt:Date.now()};
      if(name==='twinlyAi'&&data?.mode==='ask')return {answer:'直近の集計では大きな変化はありません。',source:'review',generatedAt:Date.now()};
      return premium;
    });

    render(<div><button aria-label="週間タイムラインを開く">timeline</button><AiAdviceLauncher/></div>);
    const launcher=await screen.findByRole('button',{name:'AIアドバイスを見る'});
    fireEvent.click(launcher);
    expect(screen.queryByLabelText('AIへの質問')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button',{name:'同意してアドバイスを見る'}));
    await screen.findByText('最近は安定しています');

    expect(screen.getByText('AIに質問する')).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'start voice input'})).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('AIへの質問'),{target:{value:'最近、睡眠は減ってる？'}});
    fireEvent.click(screen.getByRole('button',{name:'質問する'}));
    expect(await screen.findByText('直近の集計では大きな変化はありません。')).toBeInTheDocument();
    await waitFor(()=>expect(mock.service.mock.calls.some(([name,data])=>name==='twinlyAi'&&data?.mode==='ask')).toBe(true));
  });

  it('activates the target tab through the mousedown path after a short left swipe',async()=>{
    mock.service.mockImplementation(async(name)=>name==='getFamilyAccess'?premium:premium);
    const switchToSecond=vi.fn();

    render(<div>
      <div className="twinly-baby-tabs-list">
        <button role="tab">1人目</button>
        <button role="tab" onMouseDown={switchToSecond}>2人目</button>
      </div>
      <div className="twinly-baby-tabs-content" data-state="active">
        <div><button aria-label="週間タイムラインを開く">timeline</button></div>
      </div>
      <AiAdviceLauncher/>
    </div>);

    const launcher=await screen.findByRole('button',{name:'AIアドバイスを見る'});
    expect(launcher).toHaveStyle({touchAction:'none'});
    expect(launcher).toHaveAttribute('data-twinly-ai-advice-button','true');

    fireEvent.pointerDown(launcher,{pointerId:1,pointerType:'touch',clientX:140,clientY:30});
    fireEvent.pointerMove(launcher,{pointerId:1,pointerType:'touch',clientX:124,clientY:34});

    expect(switchToSecond).toHaveBeenCalledTimes(1);

    fireEvent.pointerUp(launcher,{pointerId:1,pointerType:'touch',clientX:124,clientY:34});
    fireEvent.click(launcher);
    expect(screen.queryByText('今日のAIアドバイス')).not.toBeInTheDocument();
  });

  it('switches the real Radix baby tab through its mousedown selection path',async()=>{
    mock.service.mockImplementation(async(name)=>name==='getFamilyAccess'?premium:premium);

    render(<>
      <Tabs defaultValue="A">
        <TabsList className="twinly-baby-tabs-list">
          <TabsTrigger value="A">1人目</TabsTrigger>
          <TabsTrigger value="B">2人目</TabsTrigger>
        </TabsList>
        <TabsContent forceMount value="A" className="twinly-baby-tabs-content">
          <div><button aria-label="週間タイムラインを開く">timeline A</button></div>
        </TabsContent>
        <TabsContent forceMount value="B" className="twinly-baby-tabs-content">
          <div><button aria-label="週間タイムラインを開く">timeline B</button></div>
        </TabsContent>
      </Tabs>
      <AiAdviceLauncher/>
    </>);

    await waitFor(()=>expect(document.querySelectorAll('button[aria-label="AIアドバイスを見る"]').length).toBe(2));
    const activePanel=document.querySelector<HTMLElement>('.twinly-baby-tabs-content[data-state="active"]');
    const launcher=activePanel?.querySelector<HTMLButtonElement>('button[aria-label="AIアドバイスを見る"]');
    expect(launcher).not.toBeNull();

    fireEvent.pointerDown(launcher!,{pointerId:2,pointerType:'touch',clientX:150,clientY:40});
    fireEvent.pointerMove(launcher!,{pointerId:2,pointerType:'touch',clientX:134,clientY:43});

    await waitFor(()=>expect(screen.getByRole('tab',{name:'2人目'})).toHaveAttribute('data-state','active'));
  });
});
