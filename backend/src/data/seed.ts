import { v4 as uuid } from 'uuid';
import type { User, Line, Template, Checklist, MachineTemplate, Notification } from '../types/index.js';
import { getStore, save } from './store.js';

// Machine definitions shared by Line 91 and Line 92 templates

const machines: MachineTemplate[] = [
  {
    name: 'FILLER',
    categories: [
      {
        name: 'Prep',
        tasks: [
          { description: 'Remove cap sorter lid and blow out debris underneath sorter detail & sanitize.', machine: null },
          { description: 'Sweep debris, caps & corks from 2nd level of filler room (top of filler room)', machine: null },
          { description: 'Blow out, clean & sanitize cap and cork hoppers (loading hoppers)', machine: null },
        ],
      },
      {
        name: 'Clean',
        tasks: [
          { description: 'Remove all filler/rinser bottling handling parts and filler guard doors.', machine: null },
          { description: 'Remove sealing rubbers and place in a clean 5 gallon bucket.', machine: null },
          { description: 'Foam on top of filler and underneath filler completely & from rinser in feed to filler discharge.', machine: null },
          { description: 'Foam conveyors & floor, bottling handling parts and sealing rubbers inside 5 gallon bucket.', machine: null },
          { description: 'Scrub the Filler Valves/Block.', machine: null },
          { description: 'Pressure wash filler pedestals, filler base, filler carousel wall, bottling handling parts.', machine: null },
          { description: 'Disconnect butt tub, remove pan, clean debris, foam and rinse.', machine: null },
          { description: 'Blow out debris and corks from cork sorter and sanitize.', machine: null },
          { description: 'Scrub brass plate of corker (simple green/scratch pads) & remove excess grease from plungers', machine: null },
          { description: 'Clean lower part of corker removing glass, corks and scrub pedestals.', machine: null },
          { description: 'Blow down capper flat surface, cap chute and sanitize chute.', machine: null },
          { description: 'Clean lower part of capper removing glass, grease, caps and scrub pedestals', machine: null },
          { description: 'Sweep floor & clean drains.', machine: null },
          { description: 'Install bottle handling parts, sealing rubbers, grippers and CIP cups.', machine: null },
          { description: 'SSP & call L5/TL for ATP filler swab and cleanliness verification.', machine: null },
        ],
      },
      {
        name: 'Outside',
        tasks: [
          { description: 'Foam, scrub and pressure wash conveyors and rails from filler discharge to dynac A.', machine: null },
          { description: 'Clean hoods, plastics covers from 90 turn to filler infeed', machine: null },
          { description: 'Sweep debris, glass, caps, corks from 90 turn to dynac A & mop.', machine: null },
          { description: 'Clean CarboQC unit and table & filler carts.', machine: null },
          { description: 'Clean filler desk, MES computer, main line, FW computer, Iodophor sink, and filler HMI', machine: null },
          { description: 'Empty glass and trash can, rinse glass cans inside and out; empty and replace trash bag.', machine: null },
          { description: 'Return cleaning supplies from line; Dispose of all aerosol cans to proper areas.', machine: null },
          { description: 'Clean sealing rubbers, soak in sano rinse for 20min, inspect, spray with ethanol let dry; bag & tag.', machine: null },
        ],
      },
    ],
  },

  {
    name: 'FW SKID',
    categories: [
      {
        name: 'Tasks',
        tasks: [
          { description: 'Ensure area is free of non conforming product', machine: null },
          { description: 'Clean all stainless steel boxes, electrical panels on top and sides (stainless steel)', machine: null },
          { description: 'Sweep debris behind filler from filler infeed to DYNAC A', machine: null },
          { description: 'Mop entire area from filler infeed to DYNAC A, ensure it is free of wine stains', machine: null },
          { description: 'Ensure area is free of stagnant water', machine: null },
          { description: 'Inspect gas/air filters (replace if needed) at carbonator, filler Co2, sparging line and buffer tank', machine: null },
          { description: 'Collect CLo2 water samples 10ppm & 1ppm, deliver samples to micro lab (day shift only) call L5 to deliver samples if needed', machine: null },
          { description: 'Remove the caustic bypass extension and cap pipes when not in use', machine: null },
          { description: 'Clean Brix meter at clip 25.', machine: null },
          { description: 'SG, CV and surrounding pipes, repair or replace CV as needed, clean pipes, sight glass and CV with iodophor prior to reinstallation (call maintenance for assistance)', machine: null },
          { description: 'Clean catch pans under the filter canisters', machine: null },
          { description: 'Pressure relief valves, remove clear hoses to drain pipes, cleaning hose and valve, Re-Install hose', machine: null },
          { description: 'Verify HWF at corker (Verify water flushes out of the corker tulips)', machine: null },
          { description: 'Clean Drains', machine: null },
          { description: 'Ensure all cleaning supplies have been removed from line; Dispose of all aerosol cans to proper areas', machine: null },
          { description: 'Integrity test filters after HWF', machine: null },
          { description: 'Clean sparging stone at carbinator tank before caustic is done (2x a month)', machine: null },
          { description: 'Ensure area is free of nonconforming materials', machine: null },
          { description: 'Return cleaning supplies from line; Dispose of all aerosol cans to proper areas.', machine: null },
          { description: 'Assist filler operator when task are completed', machine: null },
        ],
      },
    ],
  },

  {
    name: 'FOILER',
    categories: [
      {
        name: 'Tasks',
        tasks: [
          { description: 'Blow down spinner head turret', machine: null },
          { description: 'Blow out debris from spinner heads', machine: null },
          { description: 'Blow down glass, foils and debris from foiler base and platform', machine: null },
          { description: 'Blow down heat tunnel', machine: null },
          { description: 'Sweep glass, foils and debris from foiler blower to heat tunnel', machine: null },
          { description: 'Wipe down the foil cups.', machine: null },
          { description: 'Clean Magazine', machine: null },
          { description: 'Clean foiler base with simple green, brush and paper towels', machine: null },
          { description: 'Wipe down worm', machine: null },
          { description: 'Clean then inside and out of foiler blower covers', machine: null },
          { description: 'Remove debris, glass etc. from inside the foiler blower', machine: null },
          { description: 'Clean foiler infeed conveyors and rails (simple green & scratch pad)', machine: null },
          { description: 'Clean foiler outfeed conveyors and rails (simple green & scratch pad)', machine: null },
          { description: 'Clean foiler blower and inside rails (simple green, brush and water)', machine: null },
          { description: 'Wipe down platform', machine: null },
          { description: 'Wipe down all stainless steel (stainless steel cleaner)', machine: null },
          { description: 'Wipe down all glass/Plexiglas(glass cleaner)', machine: null },
          { description: 'Mop floors from blower to heat tunnel including under equipment and behind foiler', machine: null },
          { description: 'Clean and Align all PE\'s and Reflectors', machine: null },
          { description: 'Ensure area is free of nonconforming materials', machine: null },
          { description: 'Return cleaning supplies from line; Dispose of all aerosol cans to proper areas.', machine: null },
        ],
      },
    ],
  },

  {
    name: 'LABELER',
    categories: [
      {
        name: 'Tasks',
        tasks: [
          { description: 'Clean blowers/bottle wormers with pressure washer, simple green, glass cleaner & stainless steel cleaner', machine: null },
          { description: 'LOTO - Plug main air valve/turn off', machine: null },
          { description: 'Clean laser lens then cover with plastic bags', machine: null },
          { description: 'Clean glass fragments, spray Kim wipes with ethanol (see SW)', machine: null },
          { description: 'Clean 2 cold glue agg (Magazine, pallets, glue roller, glue knife) soak in hot water if needed, wipe down with simple green', machine: null },
          { description: 'simple green', machine: null },
          { description: 'Clean excess glue tube, soak in hot water', machine: null },
          { description: 'Clean 4 PS agg (rollers, fan box), wipe down with simple green', machine: null },
          { description: 'Remove bottle plates and clean with hot water', machine: null },
          { description: 'Remove and clean brushes with hot water', machine: null },
          { description: 'Remove and clean bottle handling parts hot water and CB-7', machine: null },
          { description: 'Blow out debris, glass, labels from labeler base', machine: null },
          { description: 'Clean labeler base with simple green, brush, water and wipes', machine: null },
          { description: 'Clean all glass/Plexiglas (glass cleaner)', machine: null },
          { description: 'Wipe down all stainless steel (stainless steel cleaner)', machine: null },
          { description: 'Clean Floors including under the labeler (blow down, mop/scrub)', machine: null },
          { description: 'Dump/Rinse Garbage Cans', machine: null },
          { description: 'Inspect centering bells (remove centering bell, inspect for broken tips on the stud) clean and inspect do not pull or push easily', machine: null },
          { description: 'Clean Roller, Shaft, and Knife, Re-oil', machine: null },
          { description: 'Check Cold Glue Aggregate Oil Levels; notify maintenance if oil is needed', machine: null },
          { description: 'Clean Roll Down Belt and Foam Pad', machine: null },
          { description: 'Clean Infeed and Discharge rails and conveyors from foiler to labeler (brush with simple green and water and wipe dry)', machine: null },
          { description: 'Clean and check In/Out dead plate transfers', machine: null },
          { description: 'Clean glue pumps whit hot water', machine: null },
          { description: 'Check infeed and discharge conveyor for missing links', machine: null },
          { description: 'Remove LOTO', machine: null },
          { description: 'Clean Drains', machine: null },
          { description: 'Clean and Align all PE\'s and Reflectors', machine: null },
          { description: 'Ensure area is free of nonconforming materials', machine: null },
          { description: 'Return cleaning supplies from line; Dispose of all aerosol cans to proper areas.', machine: null },
        ],
      },
    ],
  },

  {
    name: 'CASE PACKER',
    categories: [
      {
        name: 'Tasks',
        tasks: [
          { description: 'Clean Grid Basket, remove soak in hot water replace any broken or missing springs', machine: null },
          { description: 'Cover print and applies, photo eyes, motors and reflectors with bags from lanner to sealer', machine: null },
          { description: 'Wash down table top with pressure washer', machine: null },
          { description: 'Wash down packer outfeed conveyors with pressure washer', machine: null },
          { description: 'Drop down and wipe drip pan (simple green)', machine: null },
          { description: 'Wipe down all glass/Plexiglas (glass cleaner)', machine: null },
          { description: 'Blow down conveyor chains/conveyor and scrub/mop floors', machine: null },
          { description: 'Wipe down all stainless steel (stainless cleaner)', machine: null },
          { description: 'Clean rollers on conveyor (Remove any build up)', machine: null },
          { description: 'Detail print and apply area', machine: null },
          { description: 'Sweep operator side from lanner, packer to sealer', machine: null },
          { description: 'Mop operator side from lanner, packer to sealer', machine: null },
          { description: 'Sweep non operator side from lanner to packer to sealer', machine: null },
          { description: 'Mop non operator side from lanner to packer to sealer', machine: null },
          { description: 'Ensure all oil canisters are full, call maintenance if oil is needed', machine: null },
          { description: 'Dump and rinse garbage/glass cans', machine: null },
          { description: 'Dump and rinse 5 gallon buckets non operator side', machine: null },
          { description: 'Clean and Align all PE\'s and Reflectors', machine: null },
          { description: 'Ensure all cleaning supplies have been removed from line; Dispose of all aerosol cans to proper areas', machine: null },
        ],
      },
    ],
  },

  {
    name: 'DEPAL - DYNAC',
    categories: [
      {
        name: 'DYNAC A/B',
        tasks: [
          { description: 'Lock out /Tag Out', machine: null },
          { description: 'Remove all bottles inside dynacs', machine: null },
          { description: 'Run CIP system', machine: null },
          { description: 'Rinse down framing and floors removing all glass and debries', machine: null },
          { description: 'Sweep inside, around dynacs and underneath dynac soap containers', machine: null },
          { description: 'Clean dynac drains', machine: null },
          { description: 'Detail clean all inside windows', machine: null },
          { description: 'Detail clean all outside windows', machine: null },
          { description: 'Remove LOTO tag', machine: null },
          { description: 'Start lube 4 hours before production start', machine: null },
          { description: 'Mop around dynacs', machine: null },
          { description: 'Ensure area is free of nonconforming product', machine: null },
          { description: 'Clean & inspect dynac rails and spider.', machine: null },
        ],
      },
      {
        name: 'DEPAL',
        tasks: [
          { description: 'Lock out/Tag on', machine: null },
          { description: 'Blowout all glass debris', machine: null },
          { description: 'Wipe off any build up', machine: null },
          { description: 'Inspect for leaks, missing bolts', machine: null },
          { description: 'Blow off overhead conveyors', machine: null },
          { description: 'Clean hoods, plastic covers and all stainless steel from depal to 90deg.', machine: null },
          { description: 'Remove LOTO tag', machine: null },
          { description: 'Sweep around depal', machine: null },
          { description: 'Sweep underneath empty bottle conveyor', machine: null },
          { description: 'Sweep glass and debries inside line between empty bottle conveyor and dynacs from depal to fw skid', machine: null },
          { description: 'Mop floors underneath empty bottle conveyor and between dynacs from depal to fw skid', machine: null },
          { description: 'Sweep walkway from depal to 90 degree turn', machine: null },
          { description: 'Mop floor walkway from depal to 90 degree turn', machine: null },
          { description: 'Dump/rinse garbage cans', machine: null },
          { description: 'Clean and Align all PE\'s and Reflectors', machine: null },
          { description: 'Ensure all cleaning supplies have been removed from line; Dispose of all aerosol cans to proper areas', machine: null },
        ],
      },
    ],
  },

  {
    name: 'CASE FORMER - PARTITION INSERT',
    categories: [
      {
        name: 'General',
        tasks: [
          { description: 'Sweep and 5-S around bailer area', machine: null },
          { description: 'Dump/Rinse Garbage Cans', machine: null },
        ],
      },
      {
        name: 'Case Former',
        tasks: [
          { description: 'Blow down equipment top to bottom', machine: null },
          { description: 'Remove all glue build up & detail equipment center surfaces', machine: null },
          { description: 'Clean all grease build up, check for leaks', machine: null },
          { description: 'Check the guide rails for cleanliness', machine: null },
          { description: 'Inspect quick change handles for breakage (25-30 handles)', machine: null },
          { description: 'Check the fasteners (bolts, nuts, screws, etc.)', machine: null },
          { description: 'Detail equipment center surfaces', machine: null },
          { description: 'Check the bulbs, regulators and indicators', machine: null },
          { description: 'Check vacuum cups (2)', machine: null },
          { description: 'Inspect all air piping and air cylinders (6) for leaks, while running', machine: null },
          { description: 'Check for cracks in plexiglass and clean', machine: null },
          { description: 'Clean floors with air hose, sweep up debris, mop if needed', machine: null },
        ],
      },
      {
        name: 'Partition Inserter',
        tasks: [
          { description: 'Blow down equipment top to bottom', machine: null },
          { description: 'nozzles', machine: null },
          { description: 'Clean all grease build up, check for leaks', machine: null },
          { description: 'Check all suction cups (pick arms, t-bar, and case exchange)', machine: null },
          { description: 'Open & close each transport, all should actuate with each other', machine: null },
          { description: 'Fill all 6 Oiler Levels', machine: null },
          { description: 'Clean HMI and check all buttons illuminated', machine: null },
          { description: 'Clean floors with air hose, sweep up debris, mop if needed', machine: null },
          { description: 'Check for air leaks', machine: null },
          { description: 'Clean filters (4), cartridge for main T-bar filter, and on each side for each magazine, check "O-ring" installation', machine: null },
          { description: 'Clean vacuum pump main air filter', machine: null },
          { description: 'Inspect lacing & tracking of carton conveyor belts', machine: null },
          { description: 'Check springs on Magazine Pick Assemblies for fatigue', machine: null },
          { description: 'Check safety systems (E-Stops, door interlocks)', machine: null },
          { description: 'Inspect quick change handles for breakage', machine: null },
          { description: 'Check the fasteners (bolts, nuts, screws, etc.)', machine: null },
          { description: 'Check for cracks in plexiglass and Clean', machine: null },
          { description: 'Clean floors with air hose, sweep up debris and mop', machine: null },
          { description: 'Ensure all cleaning supplies have been removed from line; Dispose of all aerosol cans to proper areas', machine: null },
        ],
      },
    ],
  },
];

// Machine definitions for Line 93

const machines93: MachineTemplate[] = [
  {
    name: 'DEPAL - DYNAC',
    categories: [
      {
        name: 'DYNAC A/B',
        tasks: [
          { description: 'LOTO the equipment.', machine: null },
          { description: 'Blow out all glass from inside Dynac.', machine: null },
          { description: 'Wipe off all wine stains inside framing.', machine: null },
          { description: 'Remove LOTO tag.', machine: null },
          { description: 'Run CIP system.', machine: null },
          { description: 'LOTO the equipment.', machine: null },
          { description: 'Foam the cement floor and rinse all glass debris off the floor.', machine: null },
          { description: 'Clean all inside windows (glass cleaner). DO NOT use green scratch pads as they will damage the surface.', machine: null },
          { description: 'Clean all outside windows (glass cleaner). DO NOT use green scratch pads as they will damage the surface.', machine: null },
          { description: 'Remove LOTO tag.', machine: null },
          { description: 'Start lube 4 hours before production starts.', machine: null },
          { description: 'Empty and rinse out all trash and recycling bins.', machine: null },
          { description: 'Ensure area is free of non-conforming product.', machine: null },
          { description: 'Clean drains.', machine: null },
          { description: 'Clean & inspect change parts, realis and spider, put away clean parts and cover them.', machine: null },
        ],
      },
      {
        name: 'DEPAL',
        tasks: [
          { description: 'LOTO the equipment.', machine: null },
          { description: 'Blowout all glass debris.', machine: null },
          { description: 'Wipe off any build up.', machine: null },
          { description: 'Inspect for missing bolts, lube, leaks under conveyance.', machine: null },
          { description: 'degree turn.', machine: null },
          { description: 'Sweep area.', machine: null },
          { description: 'Empty and rinse out all trash and recycling bins.', machine: null },
          { description: 'Scrub floor with floor scrubber.', machine: null },
          { description: 'Ensure all cleaning supplies have been removed from line. Dispose of all aerosol cans to proper areas.', machine: null },
          { description: 'Detail doors/windows (glass cleaner). DO NOT use green scratch pads as they will damage the surface.', machine: null },
          { description: 'Remove LOTO.', machine: null },
        ],
      },
    ],
  },

  {
    name: 'FILLER',
    categories: [
      {
        name: 'Prep (1)',
        tasks: [
          { description: 'If product with caps has ran: Clean out each slot in cap sorter (top of filler room).', machine: null },
          { description: 'PM Only - Blow down plate beneath cap sorter slots; detail & sanitize (top of filler room, get maintenance help).', machine: null },
          { description: 'Blow out clean & sanitize cap and cork hoppers (loading hoppers).', machine: null },
          { description: 'Sweep debris from 2nd level of filler (top of filler room).', machine: null },
        ],
      },
      {
        name: 'Clean (2)',
        tasks: [
          { description: 'Remove all filler/rinser bottling handling parts, sealing rubbers.', machine: null },
          { description: 'Clean lower part of corker & pedestals.', machine: null },
          { description: 'Blow down capper flat surface and cap chute, clean & sanitize chute, clean lower part of capper & pedestals.', machine: null },
          { description: 'Foam underneath filler, on top of filler & completely from rinser in feed to discharge, including conveyors & floor, bottling handling parts.', machine: null },
          { description: 'Scrub the Filler Valves/Block.', machine: null },
          { description: 'Pressure wash filler pedestals, filler base, filler carousel wall, filler doors, bottling handling parts.', machine: null },
          { description: 'SSP & ATP swab filler valves.', machine: null },
          { description: 'Install bottle handling parts, sealing rubbers, grippers and CIP cups.', machine: null },
          { description: 'Home the fill tubes (reference SW).', machine: null },
          { description: 'Sweep floor & clean drains.', machine: null },
          { description: 'Clean Butt tub inside and out and top/underneath step - disconnect prior. (Super foam/Rinse)', machine: null },
        ],
      },
      {
        name: 'Outside (3)',
        tasks: [
          { description: 'Hose down all conveyors from filler discharge to Dynac A including reject conveyors, foam and scrub over and under conveyors.', machine: null },
          { description: 'Clean hoods, plastics covers, conveyors and all stainless steel from 2nd 90 deg. turn to filler in feed.(simple green and stainless steel cleaner).', machine: null },
          { description: 'Sweep, mop, scrubber all debris from 90 turn up to DYNAC A.', machine: null },
          { description: 'Clean CarboQC unit and table.', machine: null },
          { description: 'Clean filler desk, MES computer, main line, FW computer, lodophor sink, and filler HMI.', machine: null },
          { description: 'Empty glass and trash can, rinse glass cans inside and out; empty and replace trash bag on garbage can; Rinse filler cart from debris.', machine: null },
          { description: 'Ensure all cleaning supplies have been removed from line; Dispose of all aerosol cans to proper areas.', machine: null },
          { description: 'Clean sealing rubbers, soak in sano rinse for 20min, inspect, spray with ethanol let it dry; bag & tag.', machine: null },
        ],
      },
    ],
  },

  {
    name: 'FW SKID',
    categories: [
      {
        name: 'Tasks',
        tasks: [
          { description: 'Ensure area is free of non conforming product.', machine: null },
          { description: 'Clean all stainless steel boxes, electrical panels on top and sides (stainless steel cleaner).', machine: null },
          { description: 'Mop area ensure it is free of wine stains.', machine: null },
          { description: 'Ensure area is free of standing water.', machine: null },
          { description: 'Inspect gas/air filters (replace if needed) at carbonator, filler Co2, sparging line and buffer tank', machine: null },
          { description: 'Collect CLo2 water samples 10ppm & 1ppm, deliver samples to micro lab (day shift only) call L5 to deliver samples if needed.', machine: null },
          { description: 'Clean Brix meter at Clip 23 (be careful not to pull out cables during', machine: null },
          { description: 'Inspect all sight glass (no liquid or debris). If liquid or debris are found; remove SG, CV and surrounding pipes, repair or replace CV as needed, clean pipes, sight glass and CV with iodophor prior to reinstallation (call Maintenance for assistance).', machine: null },
          { description: 'Pressure relief valves, remove clear hoses to drain pipes, cleaning hose and valve, re-install hose.', machine: null },
          { description: 'Verify HWS at corker (verify water flushes out of the corker tulips).', machine: null },
          { description: 'Ensure all cleaning supplies have been removed from line; dispose of all aerosol cans to proper areas', machine: null },
          { description: 'Clean Wirehooder.', machine: null },
          { description: 'Clean Cork Orientor.', machine: null },
          { description: 'Replace water for corker vacuum motor.', machine: null },
        ],
      },
    ],
  },

  {
    name: 'CAPSULAR',
    categories: [
      {
        name: 'Tasks',
        tasks: [
          { description: 'LOTO - Turn off main air valve.', machine: null },
          { description: 'Clean floors including under the equipment (blow down, mop/scrub).', machine: null },
          { description: 'Clean drains.', machine: null },
          { description: 'Remove Stars on Turret 3 and 4 (Pleater & Crimper).', machine: null },
          { description: 'Wipe down the stars and underneath the stars.', machine: null },
          { description: 'Wipe down the foil cups.', machine: null },
          { description: 'With a damp towel, wipe down the foil dispenser, and remove the fine metal shavings.', machine: null },
          { description: 'Wipe down all stainless steel (Stainless Steel cleaner).', machine: null },
          { description: 'Wipe down all glass/plexiglass with glass cleaner - DO NOT use green pad so it will scrath the surface.', machine: null },
          { description: 'Wipe down worm.', machine: null },
          { description: 'Clean infeed and discharge rails (Simple Green).', machine: null },
          { description: 'Wipe down conveyor.', machine: null },
          { description: 'Re-install all change parts that were removed.', machine: null },
          { description: 'Verify NO tools, cleaning supplies, and loose parts/equipment are in the machine.', machine: null },
          { description: 'Ensure area is free of non-conforming materials.', machine: null },
          { description: 'Ensure all cleaning supplies have been removed from line. Dispose of all aerosol cans in proper areas.', machine: null },
          { description: 'Verify NO tools, cleaning supplies, and loose parts/equipment are in the machine.', machine: null },
          { description: 'Remove LOTO.', machine: null },
          { description: 'Jog machine.', machine: null },
        ],
      },
    ],
  },

  {
    name: 'LABELER',
    categories: [
      {
        name: 'Tasks',
        tasks: [
          { description: 'LOTO the equipment.', machine: null },
          { description: 'Clean laser lens then cover with plastic bags (alcohol wipes).', machine: null },
          { description: 'Clean glass fragments, spray Kim wipe with ethanol (see SW).', machine: null },
          { description: 'Clean aggregates x 6 (magazine, pallets, glue roller, glue knife) soak in hot water if needed, wipe down with simple green.', machine: null },
          { description: 'Clean excess glue tube, soak in hot water.', machine: null },
          { description: 'Remove bottle plates. Blow down with air and wipe down only (NO soaking in water).', machine: null },
          { description: 'Remove and clean brushes with hot water.', machine: null },
          { description: 'Remove and clean bottle handling parts with hot water (no chemicals).', machine: null },
          { description: 'Wipe down and clean gripper cylinder.', machine: null },
          { description: 'Clean blowers/bottle wormers with hot water, steam cleaner, simple green, glass cleaner & stainless steel cleaner.', machine: null },
          { description: 'Clean all glass/Plexiglas (glass cleaner). DO NOT use green scratch pads as they will damage the surface.', machine: null },
          { description: 'Wipe down all stainless steel (stainless steel cleaner).', machine: null },
          { description: 'Clean floors, including under the labeler (blow down, mop/scrub).', machine: null },
          { description: 'Ensure area is free of non-conforming product and wine stains.', machine: null },
          { description: 'Empty and rinse out trash cans and recycle bins.', machine: null },
          { description: 'Inspect centering bells (remove centering bell, inspect for broken tips on the stud) clean and inspect for any that do not pull or push easily.', machine: null },
          { description: 'Clean roller, shaft, and knife. Re-oil.', machine: null },
          { description: 'Check Cold Glue aggregate oil levels.', machine: null },
          { description: 'Clean infeed and discharge rails and conveyors from capsular to labeler (brush with Simple Green and water and wipe dry).', machine: null },
          { description: 'Clean and align all PE\'s and reflectors.', machine: null },
          { description: 'Clean labeler base with damp wipes.', machine: null },
          { description: 'Clean and check In/Out dead plate transfers.', machine: null },
          { description: 'Clean glue pumps with hot water.', machine: null },
          { description: 'Check infeed and discharge conveyor for missing links.', machine: null },
          { description: 'Remove LOTO.', machine: null },
          { description: 'Jog machine.', machine: null },
          { description: 'Clean drains.', machine: null },
          { description: 'Ensure all cleaning supplies have been removed from line. Dispose of all aerosol cans in proper areas.', machine: null },
        ],
      },
    ],
  },

  {
    name: 'VARIOLINE',
    categories: [
      {
        name: 'General',
        tasks: [
          { description: 'Put varioline in changeover position.', machine: null },
          { description: 'Remove all fiber, carboard, cases, inserts.', machine: null },
          { description: 'Remove all tooling and store in carts.', machine: null },
          { description: 'Blow down varioline top to bottom inside the machine.', machine: null },
          { description: 'Remove all glue build up.', machine: null },
          { description: 'Blow all dust on the floor, starting from the depal side, out from under the machine and sweep up.', machine: null },
          { description: 'Blow down discharce conveyor toward operator side including spiral and sweep up.', machine: null },
        ],
      },
      {
        name: 'MODULES 1 and 2',
        tasks: [
          { description: 'Wax glue nozzles.', machine: null },
          { description: 'Clean suction cups on Robot 1 and 2 with a damp paper towel.', machine: null },
          { description: 'Clean forming area with Simple Green.', machine: null },
          { description: 'Clean any grease build up.', machine: null },
          { description: 'Clean all photo-eyes with alcohol wipe.', machine: null },
        ],
      },
      {
        name: 'MODULE 3',
        tasks: [
          { description: 'Clean centering frame rails with simple green.', machine: null },
          { description: 'Clean row pusher bar.', machine: null },
          { description: 'Clean any grease build up.', machine: null },
          { description: 'Clean magazine belts with Simple Green.', machine: null },
          { description: 'Clean all photo-eyes with alcohol wipe.', machine: null },
        ],
      },
      {
        name: 'MODULE 4',
        tasks: [
          { description: 'Clean spider webs (Glue) on sealer head.', machine: null },
          { description: 'Clean any grease build up.', machine: null },
          { description: 'Clean all photo-eyes with alcohol wipe.', machine: null },
        ],
      },
      {
        name: 'CLEAN FULL CASE CONVEYOR',
        tasks: [
          { description: 'Wipe down any wine residue.', machine: null },
          { description: 'Clean plate and lug chain with stainless steel cleaner.', machine: null },
        ],
      },
      {
        name: 'INFEED/OUTFEED CONVEYOR',
        tasks: [
          { description: 'Clean conveyor with wet brush.', machine: null },
          { description: 'Clean rollers on conveyor.', machine: null },
          { description: 'Clean bottle stop bar.', machine: null },
          { description: 'Clean bottle catch pan.', machine: null },
          { description: 'Clean all photo-eyes with alcohol wipe.', machine: null },
          { description: 'Clean any grease build up.', machine: null },
        ],
      },
      {
        name: 'OTHER',
        tasks: [
          { description: 'the surface.', machine: null },
          { description: 'Blow down conveyor chains/conveyor and scrub/mop floors.', machine: null },
          { description: 'Wipe down all stainless steel (stainless cleaner).', machine: null },
          { description: 'Check bulbs on doors, air regulator for leaks, and indicator lamps.', machine: null },
          { description: 'Clean HMI screens.', machine: null },
          { description: 'Check safety system - E Stops', machine: null },
          { description: 'Detail Print & Apply area.', machine: null },
          { description: 'Ensure all oil canisters are full; fill if needed.', machine: null },
          { description: 'Empty and rinse out all trash and recycling bins.', machine: null },
          { description: 'areas.', machine: null },
          { description: 'Check quick change handles for breakage.', machine: null },
          { description: 'Check motors and gear boxes for leakage.', machine: null },
          { description: 'Clean FT inspection system.', machine: null },
        ],
      },
    ],
  },
];

function toChecklistMachines(
  src: MachineTemplate[],
  allCompleted: boolean,
  issueOnFirst = false,
  operatorName = 'Gabriel Sanchez',
) {
  const ts = new Date(Date.now() - 3600000).toISOString();
  return src.map(m => ({
    name: m.name,
    categories: m.categories.map(c => ({
      name: c.name,
      items: c.tasks.map((t, i) => {
        const done = issueOnFirst ? i !== 0 : allCompleted;
        return {
          description: t.description,
          machine: t.machine,
          completed: done ? true : null,
          completedBy: done ? operatorName : null,
          completedAt: done ? ts : null,
          issue: issueOnFirst && i === 0 ? 'Needs re-inspection' : null,
          photos: [],
        };
      }),
    })),
  }));
}

export function seedIfEmpty(): void {
  const store = getStore();

  if (store.users.length > 0) return;

  const lines: Line[] = [
    { id: uuid(), name: 'Line 91' },
    { id: uuid(), name: 'Line 92' },
    { id: uuid(), name: 'Line 93' },
  ];
  store.lines = lines;

  const admin: User = {
    id: uuid(),
    name: 'Yolanda Martinez',
    email: 'ymartinez@gallo.com',
    password: 'admin123',
    role: 'admin',
  };

  const operator: User = {
    id: uuid(),
    name: 'Gabriel Sanchez',
    email: 'gsanchez@gallo.com',
    password: 'operator123',
    role: 'operator',
  };

  const operator2: User = {
    id: uuid(),
    name: 'Marcus Rivera',
    email: 'mrivera@gallo.com',
    password: 'operator123',
    role: 'operator',
  };

  store.users = [admin, operator, operator2];

  const template91: Template = {
    id: uuid(),
    title: 'Weekly Deep Clean Checklist',
    lineId: lines[0].id,
    machines,
  };

  const template92: Template = {
    id: uuid(),
    title: 'Weekly Deep Clean Checklist',
    lineId: lines[1].id,
    machines,
  };

  const template93: Template = {
    id: uuid(),
    title: 'Weekly Deep Clean Checklist',
    lineId: lines[2].id,
    machines: machines93,
  };

  store.templates = [template91, template92, template93];

  const now = new Date();

  const DAY = 86400000;
  const HOUR = 3600000;

  const cl = (
    tpl: Template,
    line: Line,
    op: User,
    status: Checklist['status'],
    daysAgo: number,
    durationHrs: number | null,
    allDone: boolean,
    hasIssue = false,
  ): Checklist => ({
    id: uuid(),
    templateId: tpl.id,
    lineId: line.id,
    lineName: line.name,
    operatorId: op.id,
    operatorName: op.name,
    status,
    startTime: new Date(now.getTime() - daysAgo * DAY).toISOString(),
    endTime: durationHrs !== null ? new Date(now.getTime() - daysAgo * DAY + durationHrs * HOUR).toISOString() : null,
    machines: toChecklistMachines(tpl.machines, allDone, hasIssue, op.name),
  });

  const checklists: Checklist[] = [
    // Gabriel — recent activity
    cl(template91, lines[0], operator, 'in_progress', 0, null, false),
    cl(template93, lines[2], operator, 'in_progress', 1, null, false),
    cl(template91, lines[0], operator, 'submitted', 1, 2, true, true),
    cl(template92, lines[1], operator, 'in_progress', 2, null, false),
    cl(template92, lines[1], operator, 'submitted', 3, 1.5, true),
    cl(template91, lines[0], operator, 'approved', 5, 2.5, true),
    cl(template93, lines[2], operator, 'approved', 7, 2, true),
    cl(template92, lines[1], operator, 'approved', 9, 1.75, true),
    cl(template91, lines[0], operator, 'denied', 10, 3, true, true),
    cl(template93, lines[2], operator, 'approved', 12, 2, true),
    cl(template91, lines[0], operator, 'approved', 14, 2.25, true),

    // Marcus — recent activity
    cl(template91, lines[0], operator2, 'in_progress', 0, null, false),
    cl(template92, lines[1], operator2, 'submitted', 2, 2, true),
    cl(template93, lines[2], operator2, 'submitted', 3, 1.5, true, true),
    cl(template91, lines[0], operator2, 'denied', 4, 2, true),
    cl(template92, lines[1], operator2, 'approved', 6, 2.5, true),
    cl(template93, lines[2], operator2, 'approved', 8, 1.75, true),
    cl(template91, lines[0], operator2, 'approved', 11, 2, true),
    cl(template92, lines[1], operator2, 'approved', 13, 2.25, true),
  ];

  store.checklists = checklists;

  const notifications: Notification[] = checklists
    .filter(c => c.status === 'submitted')
    .map(c => ({
      id: uuid(),
      checklistId: c.id,
      checklistLineName: c.lineName,
      operatorName: c.operatorName,
      createdAt: c.endTime!,
      readBy: [],
    }));

  store.notifications = notifications;

  save();
  console.log('Database seeded with sample data');
}
